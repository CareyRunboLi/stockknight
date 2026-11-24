'use strict';
// Checks a Train puzzle file against the data contract: every position loads, every move of
// every line (and every accepted alternative) is legal, ids and positions are unique, and the
// fields are filled in.
//   node tools/train/check-puzzles.js web/train/tactics.js [web/train/endgames.js ...]
const path = require('node:path');
const SK = require('../../reference/engine.js');

function check(file) {
  const data = require(path.resolve(file));
  const errors = [];
  const ids = new Set(), keys = new Set();
  for (const p of data) {
    const where = `${p.id || '?'}`;
    if (!/^[me]\d{4}$/.test(p.id)) errors.push(`${where}: bad id`);
    if (ids.has(p.id)) errors.push(`${where}: duplicate id`);
    ids.add(p.id);
    let pos;
    try {
      pos = new SK.Position(p.fen);
    } catch (e) {
      errors.push(`${where}: bad fen ${p.fen}`);
      continue;
    }
    const key = p.fen.split(' ').slice(0, 2).join(' ');
    if (keys.has(key)) errors.push(`${where}: duplicate position`);
    keys.add(key);
    if (!Array.isArray(p.line) || p.line.length % 2 !== 1) errors.push(`${where}: line must have an odd length`);
    (p.line || []).forEach((u, i) => {
      if (i % 2 === 0 && p.alts && p.alts[i / 2]) {
        for (const alt of p.alts[i / 2]) if (!pos.moveFromUci(alt)) errors.push(`${where}: illegal alternative ${alt}`);
      }
      const m = pos.moveFromUci(u);
      if (!m) errors.push(`${where}: illegal move ${u} at ${i}`);
      else pos.makeMove(m);
    });
    for (const f of ['title', 'goal', 'explain', 'result', 'group', 'source']) {
      if (typeof p[f] !== 'string' || !p[f]) errors.push(`${where}: missing ${f}`);
    }
    if (p.title && p.title.length > 40) errors.push(`${where}: title too long`);
    if (!(p.rating >= 600 && p.rating <= 2600)) errors.push(`${where}: rating ${p.rating}`);
    const level = p.rating < 1000 ? 1 : p.rating < 1300 ? 2 : p.rating < 1600 ? 3 : p.rating < 1900 ? 4 : 5;
    if (p.level !== level) errors.push(`${where}: level ${p.level} does not match rating ${p.rating}`);
    if (!Array.isArray(p.themes) || !p.themes.length) errors.push(`${where}: no themes`);
  }
  return { count: data.length, errors };
}

if (require.main === module) {
  let bad = 0;
  for (const f of process.argv.slice(2)) {
    const { count, errors } = check(f);
    console.log(`${f}: ${count} puzzles, ${errors.length} problems`);
    for (const e of errors.slice(0, 30)) console.log(`  ${e}`);
    bad += errors.length;
  }
  process.exit(bad ? 1 : 0);
}
module.exports = { check };
