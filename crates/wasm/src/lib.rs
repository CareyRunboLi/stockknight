//! Stockhorse for the website: the Rust search with a network (or G0), compiled to
//! WebAssembly (`wasm32-wasip1`) and driven by `web/wasm-engine.js` inside the engine worker.
//!
//! The tasks are ports of `play`, `analyse` and `lines` in `web/engine-tasks.js`, so the site
//! behaves the same with either engine; only the evaluation (and the speed) differs.
//!
//! Interface: the page writes a request into memory from `sk_alloc`, calls `sk_call(ptr, len)`,
//! then reads the JSON answer at `sk_result_ptr()` / `sk_result_len()`. A request is lines of
//! `key=value`: `cmd` (play, analyse, lines, eval, info), `fen`, `moves` (UCI, space
//! separated), and the task's numbers (`nodes`, `temp`, `movetime`, `depth`, `multipv`, `r`).

use std::collections::HashMap;
use std::time::Duration;

use sk_core::{Move, Position, START_FEN};
use sk_nnue::{AnyEval, Network, NnueEval, NnueMode};
use sk_search::{Searcher, MATE, MATE_BOUND};

struct State {
    searcher: Searcher<AnyEval>,
    net_name: String,
    result: Vec<u8>,
}

static mut STATE: Option<State> = None;

#[allow(static_mut_refs)]
fn state() -> &'static mut State {
    // Single-threaded: the module lives in one Web Worker.
    unsafe {
        STATE.get_or_insert_with(|| State {
            searcher: Searcher::new(AnyEval::Hand),
            net_name: "G0".into(),
            result: Vec::new(),
        })
    }
}

#[no_mangle]
pub extern "C" fn sk_alloc(len: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(len.max(1));
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

/// # Safety
/// `ptr` and `len` come from `sk_alloc`.
#[no_mangle]
pub unsafe extern "C" fn sk_free(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len.max(1)));
}

/// Loads a `.nnue` file (bytes at `ptr`); 0 on success, else the error is the result text.
///
/// # Safety
/// `ptr` and `len` describe a buffer from `sk_alloc`.
#[no_mangle]
pub unsafe extern "C" fn sk_load_net(ptr: *const u8, len: usize) -> i32 {
    let bytes = std::slice::from_raw_parts(ptr, len);
    let st = state();
    match load_net(bytes) {
        Ok((eval, name)) => {
            st.searcher = Searcher::new(eval);
            st.net_name = name.clone();
            st.result = format!("{{\"net\":{}}}", json_str(&name)).into_bytes();
            0
        }
        Err(e) => {
            st.result = e.into_bytes();
            1
        }
    }
}

fn load_net(bytes: &[u8]) -> Result<(AnyEval, String), String> {
    let net = Network::from_bytes(bytes)?;
    let name = net.description.clone();
    let mut eval = NnueEval::new(net)?;
    eval.set_mode(NnueMode::Portable);
    // The float copy is only the reference; the search runs the quantized one. Free it.
    eval.net = Network::random(1, 1, 1, 0);
    Ok((AnyEval::Nnue(Box::new(eval)), name))
}

/// # Safety
/// `ptr` and `len` describe a UTF-8 request in a buffer from `sk_alloc`.
#[no_mangle]
pub unsafe extern "C" fn sk_call(ptr: *const u8, len: usize) -> i32 {
    let text = String::from_utf8_lossy(std::slice::from_raw_parts(ptr, len)).into_owned();
    let st = state();
    match call(st, &text) {
        Ok(json) => {
            st.result = json.into_bytes();
            0
        }
        Err(e) => {
            st.result = e.into_bytes();
            1
        }
    }
}

#[no_mangle]
pub extern "C" fn sk_result_ptr() -> *const u8 {
    state().result.as_ptr()
}

#[no_mangle]
pub extern "C" fn sk_result_len() -> usize {
    state().result.len()
}

struct Req(HashMap<String, String>);

impl Req {
    fn parse(text: &str) -> Self {
        Req(text
            .lines()
            .filter_map(|l| l.split_once('='))
            .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
            .collect())
    }
    fn get(&self, k: &str) -> &str {
        self.0.get(k).map(String::as_str).unwrap_or("")
    }
    fn num(&self, k: &str, default: f64) -> f64 {
        self.get(k)
            .parse()
            .ok()
            .filter(|x: &f64| x.is_finite())
            .unwrap_or(default)
    }
}

fn build(req: &Req) -> Result<Position, String> {
    let fen = req.get("fen");
    let mut pos = Position::from_fen(if fen.is_empty() { START_FEN } else { fen })?;
    for text in req.get("moves").split_whitespace() {
        let m = pos
            .move_from_uci(text)
            .ok_or_else(|| format!("illegal move {text}"))?;
        pos.make_move(m);
    }
    Ok(pos)
}

fn call(st: &mut State, text: &str) -> Result<String, String> {
    let req = Req::parse(text);
    match req.get("cmd") {
        "info" => Ok(format!("{{\"net\":{}}}", json_str(&st.net_name))),
        "eval" => {
            let pos = build(&req)?;
            let s = &mut st.searcher;
            s.begin(&pos);
            Ok(format!(
                "{{\"score\":{}}}",
                sk_eval::Evaluator::evaluate(&mut s.eval, &pos)
            ))
        }
        "play" => play(&mut st.searcher, &req),
        "analyse" => analyse(&mut st.searcher, &req),
        "lines" => lines(&mut st.searcher, &req),
        other => Err(format!("unknown command {other}")),
    }
}

fn uci_line(pos: &mut Position, line: &[Move]) -> String {
    let mut out = Vec::new();
    for &m in line {
        out.push(json_str(&Position::move_to_uci(m)));
        pos.make_move(m);
    }
    for _ in line {
        pos.unmake_move();
    }
    format!("[{}]", out.join(","))
}

fn uci(m: Move) -> String {
    json_str(&Position::move_to_uci(m))
}

fn score_of(scores: &[(Move, i32)], m: Move) -> i32 {
    scores
        .iter()
        .find(|s| s.0 == m)
        .map(|s| s.1)
        .unwrap_or(-MATE)
}

fn sort_by_score(root: &[Move], scores: &[(Move, i32)]) -> Vec<Move> {
    let mut order = root.to_vec();
    // A stable sort, like Array.prototype.sort.
    order.sort_by_key(|&m| -score_of(scores, m));
    order
}

fn mate_done(score: i32, depth: i32) -> bool {
    score.abs() >= MATE_BOUND && depth >= MATE - score.abs()
}

/// `thinkAt` in engine-tasks.js: iterative deepening under a node budget, then (with a
/// temperature) a move drawn with probability ∝ exp((score − best) / temp). `r` in [0, 1)
/// is the page's random number.
fn play(s: &mut Searcher<AnyEval>, req: &Req) -> Result<String, String> {
    let mut pos = build(req)?;
    let root = pos.legal_moves();
    if root.is_empty() {
        return Ok(format!(
            "{{\"best\":null,\"score\":{},\"depth\":0,\"pv\":[],\"nodes\":0}}",
            -MATE
        ));
    }
    let nodes = req.num("nodes", 1e6).max(1.0) as u64;
    let temp = req.num("temp", 0.0);
    let temp = if temp > 0.5 { temp } else { 0.0 };
    let movetime = req.num("movetime", 0.0);
    let r = req.num("r", 0.0).clamp(0.0, 0.999_999);

    s.begin(&pos);
    let mut order = root.clone();
    let mut out: Option<(Move, i32, i32, Vec<(Move, i32)>)> = None;
    for d in 1..=60 {
        let (best, score, scores, complete) = s.root(&mut pos, &order, d, temp > 0.0);
        if !complete {
            break;
        }
        if temp > 0.0 {
            order = sort_by_score(&root, &scores);
        } else {
            order.retain(|&m| m != best);
            order.insert(0, best);
        }
        out = Some((best, score, d, scores));
        if d == 1 {
            let mt = (movetime > 0.0).then(|| Duration::from_millis(movetime as u64));
            s.set_limits(Some(nodes), mt);
        }
        if mate_done(score, d) || s.nodes() >= nodes {
            break;
        }
    }
    let (top, top_score, depth, scores) = out.expect("depth 1 always completes");
    let (mut best, mut score) = (top, top_score);
    if temp > 0.0 && root.len() > 1 {
        let w: Vec<f64> = root
            .iter()
            .map(|&m| (((score_of(&scores, m) - top_score) as f64 / temp).max(-50.0)).exp())
            .collect();
        let mut x = r * w.iter().sum::<f64>();
        let mut i = 0;
        while i < root.len() - 1 {
            x -= w[i];
            if x <= 0.0 {
                break;
            }
            i += 1;
        }
        best = root[i];
        score = score_of(&scores, best);
    }
    let pv = if best == top {
        s.line(&mut pos, best, depth)
    } else {
        vec![best]
    };
    Ok(format!(
        "{{\"best\":{},\"score\":{},\"rawScore\":{},\"depth\":{},\"pv\":{},\"nodes\":{}}}",
        uci(best),
        score,
        top_score,
        depth,
        uci_line(&mut pos, &pv),
        s.nodes()
    ))
}

/// `analyse` in engine-tasks.js: every root move with a full window, so each score is exact.
fn analyse(s: &mut Searcher<AnyEval>, req: &Req) -> Result<String, String> {
    let mut pos = build(req)?;
    let root = pos.legal_moves();
    if root.is_empty() {
        return Ok(format!(
            "{{\"legal\":0,\"best\":null,\"score\":{},\"depth\":0,\"scores\":{{}},\"pv\":[]}}",
            -MATE
        ));
    }
    let movetime = req.num("movetime", 400.0).max(1.0);
    let max_depth = req.num("depth", 12.0) as i32;
    s.begin(&pos);
    let mut order = root.clone();
    let mut out = None;
    for d in 1..=max_depth.max(1) {
        let (best, score, scores, complete) = s.root(&mut pos, &order, d, true);
        if !complete {
            break;
        }
        order = sort_by_score(&root, &scores);
        out = Some((best, score, d, scores));
        if d == 1 {
            s.set_limits(None, Some(Duration::from_millis(movetime as u64)));
        }
        if mate_done(score, d) || s.elapsed().as_secs_f64() * 1000.0 > movetime / 2.0 {
            break;
        }
    }
    let (best, score, depth, scores) = out.expect("depth 1 always completes");
    let pv = s.line(&mut pos, best, depth);
    let map: Vec<String> = scores
        .iter()
        .map(|&(m, v)| format!("{}:{}", uci(m), v))
        .collect();
    Ok(format!(
        "{{\"legal\":{},\"best\":{},\"score\":{},\"depth\":{},\"scores\":{{{}}},\"pv\":{},\"nodes\":{}}}",
        root.len(),
        uci(best),
        score,
        depth,
        map.join(","),
        uci_line(&mut pos, &pv),
        s.nodes()
    ))
}

/// `lines` in engine-tasks.js: the best `multipv` moves with exact scores and their lines.
fn lines(s: &mut Searcher<AnyEval>, req: &Req) -> Result<String, String> {
    let mut pos = build(req)?;
    let root = pos.legal_moves();
    if root.is_empty() {
        return Ok("{\"legal\":0,\"depth\":0,\"nodes\":0,\"lines\":[]}".into());
    }
    let movetime = req.num("movetime", 1000.0).max(1.0);
    let max_depth = (req.num("depth", 40.0) as i32).min(80).max(1);
    let k = (req.num("multipv", 3.0) as usize).clamp(1, root.len());
    let full = MATE + 1;
    s.begin(&pos);
    let mut order = root.clone();
    let mut out: Option<(i32, Vec<(i32, Move, Vec<Move>)>)> = None;
    for d in 1..=max_depth {
        let mut scores: Vec<(Move, i32)> = Vec::with_capacity(root.len());
        let mut top: Vec<(i32, Move, Vec<Move>)> = Vec::new();
        let mut complete = true;
        for &m in &order {
            s.play(&mut pos, m);
            let mut score;
            if top.len() < k {
                score = -s.search(&mut pos, d - 1, -full, full, 1);
            } else {
                let bar = top[k - 1].0;
                score = -s.search(&mut pos, d - 1, -bar - 1, -bar, 1);
                if score > bar && !s.stopped() {
                    score = -s.search(&mut pos, d - 1, -full, full, 1);
                }
            }
            s.undo(&mut pos);
            if s.stopped() {
                complete = false;
                break;
            }
            scores.push((m, score));
            if top.len() < k || score > top[k - 1].0 {
                let pv = s.line(&mut pos, m, d);
                top.push((score, m, pv));
                top.sort_by_key(|t| -t.0);
                top.truncate(k);
            }
        }
        if !complete {
            break;
        }
        order = sort_by_score(&root, &scores);
        let best = top[0].0;
        out = Some((d, top));
        if d == 1 {
            s.set_limits(None, Some(Duration::from_millis(movetime as u64)));
        }
        if mate_done(best, d) || s.elapsed().as_secs_f64() * 1000.0 > movetime / 2.0 {
            break;
        }
    }
    let (depth, top) = out.expect("depth 1 always completes");
    let items: Vec<String> = top
        .iter()
        .map(|(score, m, pv)| {
            format!(
                "{{\"move\":{},\"score\":{},\"pv\":{}}}",
                uci(*m),
                score,
                uci_line(&mut pos, pv)
            )
        })
        .collect();
    Ok(format!(
        "{{\"legal\":{},\"depth\":{},\"nodes\":{},\"lines\":[{}]}}",
        root.len(),
        depth,
        s.nodes(),
        items.join(",")
    ))
}

fn json_str(s: &str) -> String {
    let mut out = String::from("\"");
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
    out
}
