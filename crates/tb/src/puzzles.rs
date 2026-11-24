//! `sk-tb puzzles`: sample endgame positions whose solution is (nearly) unique, for the
//! website's Train section. Prints one JSON object per candidate; `tools/train/gen-endgames.js`
//! picks among them and writes the explanations.
//!
//! A candidate is either
//! - a **win**: the side to move wins, at most two moves win and every winning move wins at the
//!   shortest distance; or
//! - a **hold**: the position is a draw and exactly one move keeps it, every other move loses.
//!
//! For each candidate it prints every legal move's value and best reply, the value after a
//! null move following the key move (to spot zugzwang), and a line of best play with, at each
//! solver step, the moves that are optimal and how many moves still win (or hold).

use sk_core::{Move, Position};

use sk_tb::index::{load, scratch, Layout};
use sk_tb::sig::Sig;
use sk_tb::table::{decode_value, Tables, Wdl, DRAW, INVALID};

/// The value from the side to move's view: (wdl, distance).
fn val(tables: &Tables, pos: &Position) -> Option<(Wdl, u32)> {
    let v = tables.probe(pos)?;
    if v == INVALID {
        return None;
    }
    decode_value(v).map(|(w, d)| (w, d.unwrap_or(0)))
}

/// Value of a move for the mover, from the child's value: a loss for the opponent at d is a
/// win at d + 1. Positions with no legal move after the move are lost for the opponent at 0.
fn move_val(tables: &Tables, pos: &mut Position, m: Move) -> (Wdl, u32) {
    pos.make_move(m);
    let r = if !pos.has_legal_move() {
        (Wdl::Win, 1)
    } else if pos.bare_kings() {
        (Wdl::Draw, 0)
    } else {
        match val(tables, pos) {
            Some((Wdl::Loss, d)) => (Wdl::Win, d + 1),
            Some((Wdl::Win, d)) => (Wdl::Loss, d + 1),
            Some((Wdl::Draw, _)) => (Wdl::Draw, 0),
            None => (Wdl::Draw, 0),
        }
    };
    pos.unmake_move();
    r
}

/// Best move for the side to move: the shortest win, else a draw, else the longest loss.
fn rank(v: (Wdl, u32)) -> i64 {
    match v {
        (Wdl::Win, d) => 100_000 - d as i64,
        (Wdl::Draw, _) => 0,
        (Wdl::Loss, d) => -100_000 + d as i64,
    }
}

type Valued = Vec<(Move, (Wdl, u32))>;

fn best_moves(tables: &Tables, pos: &mut Position) -> (Valued, i64) {
    let moves = pos.legal_moves();
    let vals: Vec<(Move, (Wdl, u32))> = moves
        .iter()
        .map(|&m| (m, move_val(tables, pos, m)))
        .collect();
    let best = vals.iter().map(|&(_, v)| rank(v)).max().unwrap_or(i64::MIN);
    (vals, best)
}

fn wdl_str(v: (Wdl, u32)) -> String {
    match v {
        (Wdl::Win, d) => format!("\"w{d}\""),
        (Wdl::Draw, _) => "\"d\"".into(),
        (Wdl::Loss, d) => format!("\"l{d}\""),
    }
}

fn uci(m: Move) -> String {
    Position::move_to_uci(m)
}

fn json_list(v: &[String]) -> String {
    format!("[{}]", v.join(","))
}

/// One candidate as JSON, or None if it does not qualify.
pub fn candidate(tables: &Tables, pos: &mut Position, sig_name: &str) -> Option<(String, u32, u8)> {
    let root = val(tables, pos)?;
    let hold = root.0 == Wdl::Draw;
    if root.0 == Wdl::Loss {
        return None;
    }
    let (vals, best) = best_moves(tables, pos);
    if vals.len() < 3 {
        return None;
    }
    let good: Vec<&(Move, (Wdl, u32))> = if hold {
        vals.iter().filter(|(_, v)| v.0 != Wdl::Loss).collect()
    } else {
        vals.iter().filter(|(_, v)| v.0 == Wdl::Win).collect()
    };
    if hold {
        if good.len() != 1 || vals.iter().any(|(_, v)| v.0 == Wdl::Win) {
            return None;
        }
    } else if good.is_empty() {
        return None;
    }
    let opt_n = vals.iter().filter(|(_, v)| rank(*v) == best).count();
    let clean = good.len() <= 2 && good.iter().all(|(_, v)| rank(*v) == best);
    // "fast": several moves win, but at most two win in the fewest moves (a short finish).
    let fast = !hold && !clean && opt_n <= 2 && root.1 <= 5;
    if !hold && !clean && !fast {
        return None;
    }
    let good: Vec<&(Move, (Wdl, u32))> = if fast {
        vals.iter().filter(|(_, v)| rank(*v) == best).collect()
    } else {
        good
    };

    // Every legal move: value for the mover and the opponent's best reply.
    let mut all = Vec::new();
    for &(m, v) in &vals {
        pos.make_move(m);
        let reply = if pos.has_legal_move() {
            let (rv, rb) = best_moves(tables, pos);
            rv.iter()
                .find(|(_, x)| rank(*x) == rb)
                .map(|(r, _)| uci(*r))
        } else {
            None
        };
        pos.unmake_move();
        all.push(format!(
            "[\"{}\",{},{}]",
            uci(m),
            wdl_str(v),
            reply.map_or("null".into(), |r| format!("\"{r}\""))
        ));
    }

    // The key move, and the value after it if the opponent could pass.
    let key = good[0].0;
    pos.make_move(key);
    let null = if !pos.checked() && pos.has_legal_move() {
        let mut fen: Vec<String> = pos.to_fen().split(' ').map(String::from).collect();
        fen[1] = if fen[1] == "w" {
            "b".into()
        } else {
            "w".into()
        };
        match Position::from_fen(&fen.join(" ")) {
            Ok(p2) if !p2.checked_other() => val(tables, &p2).map(wdl_str),
            _ => None,
        }
    } else {
        None
    };
    pos.unmake_move();

    // Best play from here: up to 10 solver moves.
    let mut line = Vec::new();
    let mut steps = Vec::new();
    let mut played = 0;
    for step in 0..10 {
        let (vals, best) = best_moves(tables, pos);
        if vals.is_empty() {
            break;
        }
        let opt: Vec<Move> = vals
            .iter()
            .filter(|(_, v)| rank(*v) == best)
            .map(|(m, _)| *m)
            .collect();
        let keep = vals
            .iter()
            .filter(|(_, v)| {
                if hold {
                    v.0 != Wdl::Loss
                } else {
                    v.0 == Wdl::Win
                }
            })
            .count();
        let m = if step == 0 { key } else { opt[0] };
        steps.push(format!(
            "{{\"opt\":{},\"keep\":{keep},\"legal\":{}}}",
            json_list(
                &opt.iter()
                    .map(|&x| format!("\"{}\"", uci(x)))
                    .collect::<Vec<_>>()
            ),
            vals.len()
        ));
        line.push(format!("\"{}\"", uci(m)));
        pos.make_move(m);
        played += 1;
        if !pos.has_legal_move() || pos.bare_kings() {
            break;
        }
        let (rv, rb) = best_moves(tables, pos);
        let r = rv
            .iter()
            .find(|(_, x)| rank(*x) == rb)
            .map(|(r, _)| *r)
            .unwrap();
        line.push(format!("\"{}\"", uci(r)));
        pos.make_move(r);
        played += 1;
        if !pos.has_legal_move() {
            break;
        }
    }
    for _ in 0..played {
        pos.unmake_move();
    }

    let d = root.1;
    let json = format!(
        "{{\"sig\":\"{sig_name}\",\"fen\":\"{}\",\"kind\":\"{}\",\"dist\":{d},\"moves\":{},\"null\":{},\"line\":{},\"steps\":{}}}",
        pos.to_fen(),
        if hold { "hold" } else if fast { "fast" } else { "win" },
        json_list(&all),
        null.unwrap_or("null".into()),
        json_list(&line),
        json_list(&steps)
    );
    Some((
        json,
        d,
        if hold {
            1
        } else if fast {
            2
        } else {
            0
        },
    ))
}

trait CheckedOther {
    fn checked_other(&self) -> bool;
}
impl CheckedOther for Position {
    /// The side not to move is in check (an illegal position).
    fn checked_other(&self) -> bool {
        self.in_check(self.side ^ 1)
    }
}

/// Sample `sig`'s table and print up to `per` candidates for each kind and distance bucket.
pub fn run(tables: &Tables, sig: Sig, per: usize, seed: u64, budget: u64) {
    let (c, _) = sig.canonical();
    let layout = Layout::new(c);
    let mut scratch_pos = scratch();
    let mut counts = std::collections::HashMap::<(u8, u32), usize>::new();
    let n = layout.size;
    // A stride coprime with n walks the table in a scattered order.
    let mut stride = (n as f64 * 0.618_033_988_7) as u64 | 1;
    while gcd(stride, n) != 1 {
        stride += 2;
    }
    let mut idx = seed % n;
    let name = c.name();
    for _ in 0..budget.min(n) {
        idx = (idx + stride) % n;
        let Some((board, side)) = layout.decode(idx) else {
            continue;
        };
        let v = tables.map[&c].data[idx as usize];
        if v == INVALID || (v != DRAW && (v - 1).is_multiple_of(2)) {
            continue;
        }
        load(&mut scratch_pos, &c, &board, side);
        let Ok(mut pos) = Position::from_fen(&scratch_pos.to_fen()) else {
            continue;
        };
        if pos.in_check(pos.side ^ 1) {
            continue;
        }
        let bucket = |d: u32, kind: u8| -> (u8, u32) {
            (
                kind,
                if kind == 1 {
                    0
                } else {
                    match d {
                        0..=2 => 0,
                        3..=6 => 1,
                        7..=12 => 2,
                        13..=24 => 3,
                        _ => 4,
                    }
                },
            )
        };
        // Cheap prefilter on the bucket before the full analysis.
        let pre = if v == DRAW {
            vec![(1, 0)]
        } else {
            vec![bucket(v as u32 - 1, 0), bucket(v as u32 - 1, 2)]
        };
        if pre
            .iter()
            .all(|p| counts.get(p).copied().unwrap_or(0) >= per)
        {
            continue;
        }
        if let Some((json, d, kind)) = candidate(tables, &mut pos, &name) {
            let b = bucket(d, kind);
            let e = counts.entry(b).or_insert(0);
            if *e < per {
                *e += 1;
                println!("{json}");
            }
        }
    }
}

fn gcd(a: u64, b: u64) -> u64 {
    if b == 0 {
        a
    } else {
        gcd(b, a % b)
    }
}

/// The candidate for one position (any colours), or `null` when it does not qualify.
pub fn one(tables: &Tables, fen: &str) {
    let mut pos = Position::from_fen(fen).unwrap_or_else(|e| panic!("{e}"));
    let name = Sig::of(&pos).name();
    match candidate(tables, &mut pos, &name) {
        Some((json, _, _)) => println!("{json}"),
        None => println!("null"),
    }
}
