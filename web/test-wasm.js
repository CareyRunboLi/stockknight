'use strict';
// Checks Stockhorse in WebAssembly (web/build-wasm.sh first): with G0 it must play exactly as
// the reference engine at equal node budgets; with the site's network it must load and play
// legal moves through every task.   node web/test-wasm.js
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert');
const W = require('./wasm-engine.js');
const T = require('./engine-tasks.js');
const SK = require('../reference/engine.js');
require('./config.js');

const wasm = path.join(__dirname, 'engine', 'stockhorse.wasm');
const net = path.join(__dirname, globalThis.MAKI_CONFIG.net);

(async () => {
  const g0 = await W.load({ wasm });
  const searcher = new SK.Searcher(); // both keep their hash tables between calls
  const lines = [[], ['b2b3'], ['b2b3', 'a5a4', 'f2f3'], ['b2b3', 'a5a4', 'f2f3', 'a4a3', 'b1a3']];
  for (const moves of lines) {
    for (const nodes of [1, 3000, 40000]) {
      const pos = T.build(null, moves);
      const js = T.thinkAt(pos, { nodes, temp: 0 }, { searcher });
      const w = g0.thinkAt({ moves, nodes, temp: 0 });
      assert.deepStrictEqual([w.best, w.score, w.depth], [pos.moveToUci(js.best), js.score, js.depth], `${moves} @${nodes}`);
    }
  }
  console.log('ok   G0 in WebAssembly plays exactly as the reference engine');

  if (!fs.existsSync(net)) return console.log(`skip network tests: no ${net}`);
  const e = await W.load({ wasm, net });
  assert.match(e.net, /^knightchess-2/);
  for (const moves of lines) {
    const pos = T.build(null, moves);
    const legal = new Set(pos.legalMoves().map(m => pos.moveToUci(m)));
    const p = e.play({ moves, elo: 1500 });
    assert(legal.has(p.best), `play ${p.best}`);
    const a = e.analyse({ moves, movetime: 150 });
    assert.strictEqual(Object.keys(a.scores).length, legal.size);
    const l = e.lines({ moves, movetime: 150, multipv: 3 });
    assert.strictEqual(l.lines.length, Math.min(3, legal.size));
    assert(l.lines[0].score >= l.lines[l.lines.length - 1].score);
  }
  console.log(`ok   ${e.net.split(' ').slice(0, 3).join(' ')}: play, analyse and lines`);

  // Games from a set-up position (Play from here, online games from a position): Black to
  // move, empty reserves, later move numbers.
  for (const fen of ['rnkqnb/pppppp/6/1P4/P1PPPP/BNQKNR[PPRBpprb] b 0 1', 'k5/6/1Q4/2K3/6/6[-] b 0 1', 'k5/6/2K3/1Q4/6/6[-] w 3 12']) {
    const pos = new SK.Position(fen);
    const legal = new Set(pos.legalMoves().map(m => pos.moveToUci(m)));
    const p = e.play({ fen, moves: [], elo: 1500 });
    assert(legal.has(p.best), `play from ${fen}: ${p.best}`);
    pos.makeMove(pos.moveFromUci(p.best));
    if (pos.status().state === 'ongoing') {
      const after = new Set(pos.legalMoves().map(m => pos.moveToUci(m)));
      assert(after.has(e.play({ fen, moves: [p.best], elo: 1500 }).best), `reply from ${fen}`);
    }
    assert.strictEqual(Object.keys(e.analyse({ fen, moves: [], movetime: 100 }).scores).length, legal.size);
  }
  console.log('ok   play and analyse from set-up positions');
})().catch(err => {
  console.error(err);
  process.exit(1);
});
