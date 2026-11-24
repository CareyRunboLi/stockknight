'use strict';
// Prints a move-by-move description of Maki lines (helper for writing opening comments).
//   node tools/train/annotate.js "b2b3 d5d4 ..."
const SK = require('../../reference/engine.js');
const NAMES = '.PNBRQK';
function short(pos, m) {
  const drop = SK.moveDrop(m), to = SK.moveTo(m), from = SK.moveFrom(m);
  let t;
  if (drop) t = `${NAMES[drop]}@${SK.sqName(to)}`;
  else {
    const type = pos.board[from] & 7, cap = pos.board[to] ? 'x' : '';
    if (type === SK.PAWN) t = cap ? `${SK.sqName(from)[0]}x${SK.sqName(to)}` : SK.sqName(to);
    else {
      let dis = '';
      for (const o of pos.legalMoves()) {
        if (o !== m && !SK.moveDrop(o) && SK.moveTo(o) === to && (pos.board[SK.moveFrom(o)] & 7) === type) dis = SK.sqName(from)[0];
      }
      t = NAMES[type] + dis + cap + SK.sqName(to);
    }
  }
  const txt = pos.moveToText(m);
  if (txt.endsWith('#')) t += '#'; else if (txt.endsWith('+')) t += '+';
  return t;
}
function attacksFrom(pos, sq) {
  // enemy pieces the piece on sq attacks (pseudo-legal captures)
  const f = pos.fen().split(' ');
  const us = (pos.board[sq] >> 3);
  f[1] = us ? 'b' : 'w';
  let p;
  try { p = new SK.Position(f.join(' ')); } catch { return ['K+']; }
  return p.genMoves([], true).filter(m => !SK.moveDrop(m) && SK.moveFrom(m) === sq)
    .map(m => NAMES[p.board[SK.moveTo(m)] & 7] + SK.sqName(SK.moveTo(m)));
}
function sanLine(moves) {
  const pos = new SK.Position();
  const out = [];
  moves.forEach((u, i) => {
    const m = pos.moveFromUci(u);
    if (!m) throw new Error(`illegal ${u} at ply ${i} in ${moves.join(' ')}`);
    out.push((i % 2 === 0 ? `${i / 2 + 1}.` : (i === 0 ? '1...' : '')) + short(pos, m));
    pos.makeMove(m);
  });
  return out.join(' ');
}
module.exports = { short, sanLine, attacksFrom };
if (require.main === module) {
  const moves = process.argv[2].split(/\s+/).filter(Boolean);
  const pos = new SK.Position();
  console.log(sanLine(moves));
  moves.forEach((u, i) => {
    const m = pos.moveFromUci(u);
    const s = short(pos, m);
    const cap = !SK.moveDrop(m) && pos.board[SK.moveTo(m)] ? NAMES[pos.board[SK.moveTo(m)] & 7] : '';
    pos.makeMove(m);
    console.log(`${i}: ${s}${cap ? ' takes ' + cap : ''}  attacks ${attacksFrom(pos, SK.moveTo(m)).join(',') || '-'}  res ${pos.fen().split(' ')[0].match(/\[(.*)\]/)[1]}`);
  });
  console.log(pos.toString());
}
