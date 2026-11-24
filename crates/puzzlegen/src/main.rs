//! `sk-puzzlegen`: finds middlegame tactic puzzles in fresh self-play games and verifies them.
//!
//! ```sh
//! cargo build --release -p sk-puzzlegen
//! sk-puzzlegen gen --net g25.nnue --games 400 --threads 2 --seed 1 --out raw.jsonl
//! node tools/train/build-tactics.js raw.jsonl web/train/tactics.js   # themes, text, levels
//! ```
//!
//! Games are played by the network at small, varying node budgets with a random margin, so
//! they contain mistakes. Every middlegame position is screened with a short MultiPV search;
//! a candidate has one move that wins clearly more than every other move (or one that saves a
//! lost-looking position). Candidates are searched again at a deep budget, and the solution is
//! extended while the solver's move stays the only good one. Each line of output is a JSON
//! object with the facts the builder turns into a puzzle: the line, every solver step's top
//! moves and scores, and the depth at which the engine first found the key move for good.

use std::io::Write;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use sk_core::*;
use sk_nnue::AnyEval;
use sk_search::{Limits, Searcher, MATE, MATE_BOUND};

struct Top {
    score: i32,
    mv: Move,
}

struct Multi {
    depth: i32,
    top: Vec<Top>,
    /// First iteration from which the best move never changed.
    find_depth: i32,
    nodes: u64,
    /// The best move's line from the hash table.
    pv: Vec<Move>,
}

fn mate_done(score: i32, depth: i32) -> bool {
    score.abs() >= MATE_BOUND && depth >= MATE - score.abs()
}

/// MultiPV search (the `lines` task of the website) under a node budget.
fn multipv(
    s: &mut Searcher<AnyEval>,
    pos: &mut Position,
    k: usize,
    nodes: u64,
    max_depth: i32,
) -> Option<Multi> {
    let root = pos.legal_moves();
    if root.is_empty() {
        return None;
    }
    let k = k.min(root.len());
    let full = MATE + 1;
    s.begin(pos);
    let mut order = root.clone();
    let mut out: Option<Multi> = None;
    let mut bests: Vec<Move> = Vec::new();
    for d in 1..=max_depth {
        let mut scores: Vec<(Move, i32)> = Vec::with_capacity(root.len());
        let mut top: Vec<Top> = Vec::new();
        let mut complete = true;
        for &m in &order {
            s.play(pos, m);
            let mut score;
            if top.len() < k {
                score = -s.search(pos, d - 1, -full, full, 1);
            } else {
                let bar = top[k - 1].score;
                score = -s.search(pos, d - 1, -bar - 1, -bar, 1);
                if score > bar && !s.stopped() {
                    score = -s.search(pos, d - 1, -full, full, 1);
                }
            }
            s.undo(pos);
            if s.stopped() {
                complete = false;
                break;
            }
            scores.push((m, score));
            if top.len() < k || score > top[k - 1].score {
                top.push(Top { score, mv: m });
                top.sort_by_key(|t| -t.score);
                top.truncate(k);
            }
        }
        if !complete {
            break;
        }
        let mut o = root.clone();
        o.sort_by_key(|&m| {
            -scores
                .iter()
                .find(|x| x.0 == m)
                .map(|x| x.1)
                .unwrap_or(-full)
        });
        order = o;
        bests.push(top[0].mv);
        let best = top[0].score;
        out = Some(Multi {
            depth: d,
            top,
            find_depth: 0,
            nodes: s.nodes(),
            pv: Vec::new(),
        });
        if d == 1 {
            s.set_limits(Some(nodes), None);
        }
        if mate_done(best, d) {
            break;
        }
    }
    let mut r = out?;
    let fin = *bests.last().unwrap();
    let mut fd = bests.len();
    while fd > 0 && bests[fd - 1] == fin {
        fd -= 1;
    }
    r.find_depth = fd as i32 + 1;
    r.nodes = s.nodes();
    r.pv = s.line(pos, r.top[0].mv, r.depth);
    Some(r)
}

/// Pieces other than kings and pawns, on the board and in reserve.
fn officers(p: &Position) -> u32 {
    let mut n = 0;
    for &c in p.board.iter() {
        if c != 0 && type_of(c) != PAWN && type_of(c) != KING {
            n += 1;
        }
    }
    for side in 0..2 {
        n += (p.hand[side][ROOK as usize] + p.hand[side][BISHOP as usize]) as u32;
    }
    n
}

fn mate_s(score: i32) -> String {
    if score.abs() >= MATE_BOUND {
        let plies = MATE - score.abs();
        format!("\"M{}{}\"", if score > 0 { "" } else { "-" }, plies)
    } else {
        score.to_string()
    }
}

fn is_mate(score: i32) -> bool {
    score >= MATE_BOUND
}

/// The solver's move is the only good one.
fn unique(top: &[Top]) -> bool {
    if top.len() < 2 {
        return true;
    }
    let (b, s) = (top[0].score, top[1].score);
    if is_mate(b) {
        // Another mate at the same distance is an alternative, not a rival; a slower mate or
        // anything else is fine as long as it is not also a mate as fast.
        return !is_mate(s) || s < b;
    }
    if b >= 400 {
        return s <= b - 250 && s < 400;
    }
    s <= b - 200
}

struct Cfg {
    net: String,
    games: usize,
    threads: usize,
    seed: u64,
    out: String,
    screen_nodes: u64,
    deep_nodes: u64,
}

fn rng(x: &mut u64) -> u64 {
    *x ^= *x << 13;
    *x ^= *x >> 7;
    *x ^= *x << 17;
    *x
}

fn analyse(
    s: &mut Searcher<AnyEval>,
    fen: &str,
    cfg: &Cfg,
    game: usize,
    ply: usize,
) -> Option<String> {
    let mut pos = Position::from_fen(fen).ok()?;
    // Screen.
    let m = multipv(s, &mut pos, 2, cfg.screen_nodes, 30)?;
    if m.top.len() < 2 {
        return None;
    }
    let (b, sc) = (m.top[0].score, m.top[1].score);
    let attack = (b >= 250 && sc <= b - 250 && (sc <= 150 || (is_mate(b) && sc < 700)))
        || (is_mate(b) && !is_mate(sc) && sc < 700);
    let defence = b > -120 && sc <= b - 300 && b < 250;
    if !attack && !defence {
        return None;
    }
    // Deep verification, and extend the line.
    s.clear();
    let mut steps: Vec<String> = Vec::new();
    let mut line: Vec<Move> = Vec::new();
    let first = multipv(s, &mut pos, 4, cfg.deep_nodes, 40)?;
    if !unique(&first.top) {
        return None;
    }
    let b0 = first.top[0].score;
    let s0 = first.top[1].score;
    let still = if defence {
        b0 > -120 && s0 <= b0 - 300
    } else {
        (b0 >= 250 && s0 <= b0 - 250 && (s0 <= 150 || (is_mate(b0) && s0 < 700)))
            || (is_mate(b0) && !is_mate(s0) && s0 < 700)
    };
    if !still {
        return None;
    }
    let mating = is_mate(b0) && MATE - b0 <= 7;
    let mut cur = first;
    let mut work = pos.clone();
    loop {
        let top_s: Vec<String> = cur
            .top
            .iter()
            .map(|t| format!("[\"{}\",{}]", Position::move_to_uci(t.mv), mate_s(t.score)))
            .collect();
        let pv_s: Vec<String> = cur
            .pv
            .iter()
            .map(|&m| format!("\"{}\"", Position::move_to_uci(m)))
            .collect();
        steps.push(format!(
            "{{\"top\":[{}],\"pv\":[{}],\"depth\":{},\"find\":{},\"nodes\":{}}}",
            top_s.join(","),
            pv_s.join(","),
            cur.depth,
            cur.find_depth,
            cur.nodes
        ));
        let mv = cur.top[0].mv;
        let sc = cur.top[0].score;
        line.push(mv);
        work.make_move(mv);
        if defence || steps.len() >= 4 {
            break;
        }
        // Opponent's best reply.
        let fen2 = work.to_fen();
        let mut w2 = Position::from_fen(&fen2).ok()?;
        if !w2.has_legal_move() {
            break; // mate or stalemate
        }
        let reply = match multipv(s, &mut w2, 1, cfg.deep_nodes / 2, 40) {
            Some(r) => r,
            None => break,
        };
        let rm = reply.top[0].mv;
        w2.make_move(rm);
        let mut w3 = Position::from_fen(&w2.to_fen()).ok()?;
        let next = match multipv(s, &mut w3, 4, cfg.deep_nodes, 40) {
            Some(r) => r,
            None => break,
        };
        // Continue while the next solver move is still the only good one; for mates, until
        // the mate. For material, stop once the gain is banked (the next move is not forced).
        if mating {
            if !is_mate(next.top[0].score) {
                return None; // the mate went away: not trustworthy
            }
        } else if !unique(&next.top) {
            break;
        }
        if !mating && !is_mate(sc) {
            // Only continue a material line when the next move is a capture or the win is not
            // yet visible in material terms; keep lines short.
            let capt = w3.board[move_to(next.top[0].mv) as usize] != 0;
            if !capt && steps.len() >= 2 {
                break;
            }
        }
        line.push(rm);
        work = w2;
        cur = next;
    }
    let line_s: Vec<String> = line
        .iter()
        .map(|&m| format!("\"{}\"", Position::move_to_uci(m)))
        .collect();
    Some(format!(
        "{{\"fen\":\"{}\",\"kind\":\"{}\",\"game\":{},\"ply\":{},\"line\":[{}],\"steps\":[{}]}}",
        fen,
        if defence { "defence" } else { "attack" },
        game,
        ply,
        line_s.join(","),
        steps.join(",")
    ))
}

fn play_game(
    s: &mut Searcher<AnyEval>,
    play: &mut Searcher<AnyEval>,
    cfg: &Cfg,
    game: usize,
    out: &Mutex<std::fs::File>,
) {
    let mut x = cfg.seed.wrapping_mul(0x9e37_79b9_7f4a_7c15)
        ^ (game as u64 + 1).wrapping_mul(0xbf58_476d_1ce4_e5b9);
    for _ in 0..4 {
        rng(&mut x);
    }
    let mut pos = Position::startpos();
    let random_plies = 2 + (rng(&mut x) % 7) as usize;
    // Each side gets its own strength for the whole game.
    let budgets = [300u64, 800, 2000, 5000, 15000];
    let side_nodes = [
        budgets[(rng(&mut x) % 5) as usize],
        budgets[(rng(&mut x) % 5) as usize],
    ];
    let side_margin = [(rng(&mut x) % 120) as i32, (rng(&mut x) % 120) as i32];
    let mut found = 0;
    let mut last_found_ply = 0usize;
    for ply in 0..160 {
        if !pos.has_legal_move() || pos.repetition_count() >= 3 || pos.bare_kings() {
            break;
        }
        let legal = pos.legal_moves();
        if ply >= 8 && (found == 0 || ply >= last_found_ply + 12) && officers(&pos) >= 4 {
            let fen = pos.to_fen();
            if let Some(j) = analyse(s, &fen, cfg, game, ply) {
                let mut f = out.lock().unwrap();
                writeln!(f, "{j}").unwrap();
                f.flush().unwrap();
                found += 1;
                last_found_ply = ply;
            }
        }
        let m = if ply < random_plies {
            legal[(rng(&mut x) % legal.len() as u64) as usize]
        } else {
            let side = pos.side as usize;
            let lim = Limits {
                nodes: Some(side_nodes[side]),
                random_margin: side_margin[side],
                seed: rng(&mut x),
                ..Default::default()
            };
            let mut p2 = pos.clone();
            play.think(&mut p2, lim, |_| {}).best
        };
        pos.make_move(m);
    }
    eprintln!("game {game}: {found} puzzles, {} plies", pos.game_ply());
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.get(1).map(String::as_str) != Some("gen") {
        eprintln!("usage: sk-puzzlegen gen --net FILE --games N --threads T --seed S --out FILE [--screen-nodes N --deep-nodes N]");
        std::process::exit(2);
    }
    let get = |k: &str, d: &str| -> String {
        args.iter()
            .position(|a| a == k)
            .and_then(|i| args.get(i + 1))
            .cloned()
            .unwrap_or_else(|| d.to_string())
    };
    let cfg = Arc::new(Cfg {
        net: get("--net", "none"),
        games: get("--games", "100").parse().unwrap(),
        threads: get("--threads", "2").parse().unwrap(),
        seed: get("--seed", "1").parse().unwrap(),
        out: get("--out", "raw.jsonl"),
        screen_nodes: get("--screen-nodes", "40000").parse().unwrap(),
        deep_nodes: get("--deep-nodes", "1500000").parse().unwrap(),
    });
    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&cfg.out)
        .unwrap();
    let out = Arc::new(Mutex::new(file));
    let next = Arc::new(std::sync::atomic::AtomicUsize::new(0));
    let mut handles = Vec::new();
    for _ in 0..cfg.threads {
        let (cfg, out, next) = (cfg.clone(), out.clone(), next.clone());
        handles.push(std::thread::spawn(move || {
            let mut s = Searcher::new(AnyEval::from_file(&cfg.net).unwrap());
            let mut p = Searcher::new(AnyEval::from_file(&cfg.net).unwrap());
            loop {
                let g = next.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                if g >= cfg.games {
                    break;
                }
                play_game(&mut s, &mut p, &cfg, g, &out);
            }
        }));
    }
    for h in handles {
        h.join().unwrap();
    }
    let _ = Duration::from_millis(0);
}
