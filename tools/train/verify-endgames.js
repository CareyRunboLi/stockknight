'use strict';
// Re-checks every endgame puzzle against the tablebases with `sk-tb probe`: the start position
// has the stated result, each of the solver's moves (and accepted alternative) is optimal, the
// first move is the only one that wins or holds (or one of the fastest, for a short finish),
// and each reply is the opponent's best defence.
//   node tools/train/verify-endgames.js TB_DIR [web/train/endgames.js] [target/release/sk-tb]
const path = require('node:path');
const { execFile } = require('node:child_process');
const SK = require('../../reference/engine.js');

const [dir, file = path.join(__dirname, '../../web/train/endgames.js'), bin = path.join(__dirname, '../../target/release/sk-tb')] = process.argv.slice(2);
if (!dir) {
  console.error('usage: node tools/train/verify-endgames.js TB_DIR [endgames.js] [sk-tb]');
  process.exit(2);
}
const data = require(path.resolve(file));

const probe = fen => new Promise((resolve, reject) => {
  execFile(bin, ['probe', '--dir', dir, fen], (err, out) => {
    if (err) return reject(new Error(`${fen}: ${err.message}`));
    const lines = out.trim().split('\n');
    const root = lines[0].split(': ')[1];
    const moves = new Map();
    for (const l of lines.slice(1)) {
      const m = /^\s+(\S+)\s+opponent (.*)$/.exec(l);
      if (m) moves.set(m[1], m[2]);
    }
    resolve({ root, moves });
  });
});

// A child's value ("loss in 4" for the opponent) as a score for the mover: higher is better.
function score(v) {
  if (v === 'draw') return 0;
  const m = /^(win|loss) in (\d+)$/.exec(v);
  if (!m) throw new Error(`value ${v}`);
  return m[1] === 'loss' ? 1000 - +m[2] : -1000 + +m[2];
}

async function checkOne(p) {
  const errs = [];
  const pos = new SK.Position(p.fen);
  const hold = p.themes.includes('defence');
  for (let i = 0; i < p.line.length; i++) {
    const { root, moves } = await probe(pos.fen());
    if (i === 0) {
      if (hold ? root !== 'draw' : !root.startsWith('win')) errs.push(`start is ${root}`);
    }
    const text = u => pos.moveToText(pos.moveFromUci(u));
    const vals = [...moves.values()].map(score);
    const best = Math.max(...vals);
    const mine = score(moves.get(text(p.line[i])));
    if (mine !== best) errs.push(`ply ${i}: ${p.line[i]} is not optimal`);
    if (i % 2 === 0) {
      for (const a of (p.alts && p.alts[i / 2]) || []) {
        if (score(moves.get(text(a))) !== best) errs.push(`ply ${i}: alternative ${a} is not optimal`);
      }
      if (i === 0) {
        const ok = vals.filter(v => (hold ? v === 0 : v > 0)).length;
        const fastest = vals.filter(v => v === best).length;
        const accepted = 1 + (((p.alts && p.alts[0]) || []).length);
        if (hold && ok !== 1) errs.push(`${ok} moves hold`);
        if (!hold && fastest !== accepted) errs.push(`${fastest} fastest moves but ${accepted} accepted`);
        if (!hold && !/in \d+ move/.test(p.goal) && ok !== accepted) errs.push(`${ok} moves win but ${accepted} accepted`);
      }
    }
    pos.makeMove(pos.moveFromUci(p.line[i]));
  }
  return errs;
}

(async () => {
  let bad = 0, done = 0;
  const queue = [...data];
  const worker = async () => {
    for (let p; (p = queue.shift());) {
      const errs = await checkOne(p);
      done++;
      if (errs.length) {
        bad++;
        console.log(`${p.id}: ${errs.join('; ')}`);
      }
    }
  };
  await Promise.all([worker(), worker()]);
  console.log(`${done} puzzles probed, ${bad} with problems`);
  process.exit(bad ? 1 : 0);
})();
