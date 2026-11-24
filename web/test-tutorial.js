'use strict';
// Checks the Learn section's lessons (web/lessons.js): every position is legal, every
// exercise can be solved, and the one-move exercises have the answers their text promises.
//   node web/test-tutorial.js
const assert = require('node:assert');
const SK = require('../reference/engine.js');
const { CHAPTERS, LESSONS } = require('./lessons.js');
const { Exercise, solutions } = require('./tutorial.js');

let failures = 0;
function check(name, fn) {
  try {
    fn();
  } catch (err) {
    failures++;
    console.log(`FAIL ${name}: ${err.message}`);
  }
}

// The fewest moves that collect every star (or capture every piece), by iterative deepening.
function shortestStars(step, limit = 12) {
  for (let depth = 1; depth <= limit; depth++) {
    const seen = new Map();
    const dfs = (ex, left) => {
      const key = `${ex.pos.board.join(',')}|${[...ex.stars].sort().join(',')}|${ex.pos.hand[0].join('')}`;
      if ((seen.get(key) ?? -1) >= left) return false;
      seen.set(key, left);
      for (const m of ex.pos.legalMoves()) {
        const uci = ex.pos.moveToUci(m);
        const before = new Set(ex.stars);
        const r = ex.play(uci);
        if (r === 'solved') return true;
        if (left > 1 && dfs(ex, left - 1)) return true;
        // undo: give the move back to White, then take it back
        ex.pos.side ^= 1;
        ex.pos.unmakeMove();
        ex.stars = before;
        ex.moves--;
      }
      return false;
    };
    if (dfs(new Exercise(step), depth)) return depth;
  }
  return -1;
}

const ids = new Set();
for (const l of LESSONS) {
  check(`${l.id}: header`, () => {
    assert(!ids.has(l.id), 'duplicate id');
    ids.add(l.id);
    assert(CHAPTERS.some(c => c.id === l.chapter), `unknown chapter ${l.chapter}`);
    assert(/^[PNBRQK]$/.test(l.piece));
    assert(l.steps.length > 0);
  });
  l.steps.forEach((step, i) => {
    const name = `${l.id} step ${i + 1}`;
    check(name, () => {
      const pos = new SK.Position(step.fen); // throws on an illegal position
      assert(step.text && step.text.length > 20, 'no text');
      for (const a of step.arrows || []) {
        const drop = /^([PBR])@([a-f][1-6])$/.test(a);
        assert(drop || /^[a-f][1-6][a-f][1-6]$/.test(a), `bad arrow ${a}`);
      }
      if (step.show) {
        const sq = SK.parseSq(step.show);
        assert(pos.board[sq] && pos.board[sq] >> 3 === pos.side, `nothing to show on ${step.show}`);
      }
      const t = step.task;
      if (!t) return;
      assert.strictEqual(pos.side, SK.WHITE, 'exercises are played as White');
      assert(step.goal, 'no goal');
      if (t.type === 'stars' || t.type === 'capture') {
        if (t.type === 'stars') for (const s of t.targets) assert(!pos.board[SK.parseSq(s)], `star on an occupied square ${s}`);
        const n = shortestStars(step);
        assert(n > 0, 'cannot be solved in 12 moves');
        console.log(`  ${name}: ${t.type} in ${n}`);
      } else {
        const sol = solutions(step);
        assert(sol.length > 0, 'no solution');
        if (t.type === 'moves') {
          for (const mv of t.moves) assert(pos.moveFromUci(mv), `illegal answer ${mv}`);
        }
        if (t.type === 'escape') assert(pos.inCheck(), 'not in check');
        console.log(`  ${name}: ${t.type} ${sol.join(' ')}`);
      }
    });
  });
}

// The extra facts the lesson text states.
check('tactics: the rook drop fork gives check', () => {
  const pos = new SK.Position(LESSONS.find(l => l.id === 'tactics').steps[1].fen);
  pos.makeMove(pos.moveFromUci('R@e6'));
  assert(pos.inCheck());
});
check('stalemate: the example is a win for White', () => {
  const st = new SK.Position(LESSONS.find(l => l.id === 'stalemate').steps[0].fen).status();
  assert.deepStrictEqual([st.state, st.winner, st.reason], ['win', SK.WHITE, 'stalemate']);
});
check('mate: the example is checkmate', () => {
  const st = new SK.Position(LESSONS.find(l => l.id === 'mate').steps[0].fen).status();
  assert.deepStrictEqual([st.state, st.winner, st.reason], ['win', SK.WHITE, 'checkmate']);
});

const steps = LESSONS.reduce((n, l) => n + l.steps.length, 0);
const tasks = LESSONS.reduce((n, l) => n + l.steps.filter(s => s.task).length, 0);
console.log(`${LESSONS.length} lessons, ${steps} steps, ${tasks} exercises: ${failures ? `${failures} FAILED` : 'all ok'}`);
process.exit(failures ? 1 : 0);
