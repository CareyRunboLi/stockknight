'use strict';
// Checks the Train section's data (web/train/*.js) against the rules engine.
//   node web/test-train.js
// Every position must load, every move of every solution, opening line and variation must be
// legal in order, and puzzles must be distinct and complete. See docs/TRAIN.md.
const assert = require('node:assert/strict');
const SK = require('../reference/engine.js');
const tactics = require('./train/tactics.js');
const endgames = require('./train/endgames.js');
const { openings, principles } = require('./train/openings.js');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// The position key used for duplicates: board, reserves and side to move.
const key = fen => fen.split(' ').slice(0, 2).join(' ');

function playLine(fen, line, what) {
  const pos = new SK.Position(fen);
  for (const [i, u] of line.entries()) {
    assert.equal(pos.status().state, 'ongoing', `${what}: the game is over before move ${i + 1} (${u})`);
    const m = pos.moveFromUci(u);
    assert.ok(m, `${what}: move ${i + 1} (${u}) is not legal`);
    pos.makeMove(m);
  }
  return pos;
}

function checkPuzzles(list, prefix, min) {
  assert.ok(list.length >= min, `${list.length} puzzles, want at least ${min}`);
  const ids = new Set(), keys = new Set();
  for (const p of list) {
    const what = p.id;
    assert.match(p.id, new RegExp(`^${prefix}\\d{4}$`), `${what}: id`);
    assert.ok(!ids.has(p.id), `${what}: duplicate id`);
    ids.add(p.id);
    const start = new SK.Position(p.fen);
    assert.equal(start.fen(), p.fen, `${what}: the FEN is not in normal form`);
    assert.equal(start.status().state, 'ongoing', `${what}: the game is already over`);
    assert.ok(!keys.has(key(p.fen)), `${what}: duplicate position`);
    keys.add(key(p.fen));
    assert.ok(Array.isArray(p.line) && p.line.length % 2 === 1, `${what}: the line must start and end with the solver's move`);
    playLine(p.fen, p.line, what);
    if (p.alts) {
      assert.ok(p.alts.length <= (p.line.length + 1) / 2, `${what}: more alts than solver moves`);
      const pos = new SK.Position(p.fen);
      p.alts.forEach((alts, k) => {
        for (const u of alts) {
          assert.ok(pos.moveFromUci(u), `${what}: alternative ${u} at step ${k + 1} is not legal`);
          assert.notEqual(u, p.line[2 * k], `${what}: alternative ${u} repeats the main move`);
        }
        pos.makeMove(pos.moveFromUci(p.line[2 * k]));
        if (2 * k + 1 < p.line.length) pos.makeMove(pos.moveFromUci(p.line[2 * k + 1]));
      });
    }
    assert.ok(Number.isInteger(p.level) && p.level >= 1 && p.level <= 5, `${what}: level`);
    assert.ok(Number.isFinite(p.rating) && p.rating >= 400 && p.rating <= 3000, `${what}: rating`);
    for (const f of ['group', 'title', 'goal', 'explain']) {
      assert.ok(typeof p[f] === 'string' && p[f].trim().length > 0, `${what}: ${f} is missing`);
    }
    assert.ok(p.explain.length >= 60, `${what}: the explanation is too short`);
    assert.ok(Array.isArray(p.themes) && p.themes.length, `${what}: themes`);
  }
  // Every level is represented.
  for (let l = 1; l <= 5; l++) {
    const n = list.filter(p => p.level === l).length;
    assert.ok(n >= list.length * 0.05, `level ${l} has only ${n} puzzles`);
  }
}

test('middlegame tactics: legal, distinct, complete, all levels', () => checkPuzzles(tactics, 'm', 300));
test('endgames: legal, distinct, complete, all levels', () => checkPuzzles(endgames, 'e', 200));
test('middlegame and endgame positions together: at least 500 distinct', () => {
  const keys = new Set([...tactics, ...endgames].map(p => key(p.fen)));
  assert.ok(keys.size >= 500, `${keys.size} distinct positions`);
});

test('openings: every main line and variation is legal from the start', () => {
  assert.ok(openings.length >= 10, `${openings.length} openings`);
  const ids = new Set(), names = new Set();
  for (const o of openings) {
    assert.ok(!ids.has(o.id) && !names.has(o.name), `${o.id}: duplicate id or name`);
    ids.add(o.id);
    names.add(o.name);
    assert.ok(o.side === 'w' || o.side === 'b', `${o.id}: side`);
    assert.ok(o.moves.length >= 4, `${o.id}: main line too short`);
    playLine(SK.START_FEN, o.moves, `${o.id} main line`);
    for (const v of o.variations || []) {
      assert.ok(v.name && v.moves.length, `${o.id}: a variation without a name or moves`);
      playLine(SK.START_FEN, v.moves, `${o.id} ${v.name}`);
    }
    for (const k of Object.keys(o.comments || {})) assert.ok(+k >= 0 && +k < o.moves.length, `${o.id}: comment on ply ${k}`);
    assert.ok(o.principles && o.principles.length >= 2, `${o.id}: principles`);
  }
  assert.ok(principles.length >= 5, 'general opening principles');
});

(async () => {
  let failed = 0;
  for (const t of tests) {
    try {
      await t.fn();
      console.log(`ok   ${t.name}`);
    } catch (err) {
      failed++;
      console.log(`FAIL ${t.name}\n     ${err.message}`);
    }
  }
  console.log(failed ? `${failed} of ${tests.length} failed` : `all ${tests.length} passed`);
  process.exit(failed ? 1 : 0);
})();
