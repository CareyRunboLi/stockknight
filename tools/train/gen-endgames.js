'use strict';
// Builds web/train/endgames.js, the Train section's endgame puzzles, from tablebase candidates.
//
//   sk-tb gen --dir tb --max 4 --threads 2
//   sk-tb puzzles --dir tb --per 12 --budget 3000000 <every 4-piece table> > cand.jsonl
//   node tools/train/gen-endgames.js cand.jsonl [out.js]
//
// Each candidate (crates/tb/src/puzzles.rs) is a position with a (nearly) unique winning move,
// a short finish, or a position where exactly one move holds the draw, with every legal move's
// exact value and best reply and a line of best play. This script picks a varied set, turns
// some of them round (colour swap, mirror) so both colours solve, cuts each line where the
// solution stops being unique, rates the difficulty and writes the explanations.
// `tools/train/verify-endgames.js` then re-probes every position of every line.
const fs = require('node:fs');
const path = require('node:path');
const SK = require('../../reference/engine.js');

const { Position, WHITE, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, moveFrom, moveTo, moveDrop } = SK;
const LET = '.PNBRQK';
const NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const VALUE = [0, 1, 3, 3, 5, 4, 0];
const colorName = c => (c === WHITE ? 'White' : 'Black');
const sqn = sq => 'abcdef'[sq % 6] + ((sq / 6 | 0) + 1);

// --- deterministic randomness -----------------------------------------------------------------
let seed = 20261124;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr, key) => {
  // Stable choice by a string key, so a puzzle's wording does not depend on the order of work.
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return arr[h % arr.length];
};

// --- board transforms (the rules are symmetric under both) ---------------------------------------
const mirrorSq = s => s.replace(/[a-f]/, f => 'fedcba'['abcdef'.indexOf(f)]);
const flipSq = s => s.replace(/[1-6]/, r => String(7 - +r));
function tMove(u, f) {
  if (u[1] === '@') return u.slice(0, 2) + f(u.slice(2));
  return f(u.slice(0, 2)) + f(u.slice(2, 4));
}
function tFen(fen, { mirror, swap }) {
  const [boardRes, side, clock, no] = fen.split(' ');
  const [, board, res] = /^([^[]+)\[([^\]]*)\]$/.exec(boardRes);
  let rows = board.split('/').map(r => r.replace(/\d/g, d => '.'.repeat(+d)));
  if (mirror) rows = rows.map(r => [...r].reverse().join(''));
  let s = side, reserve = res;
  if (swap) {
    rows = rows.reverse().map(r => [...r].map(c => (c === '.' ? c : c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join(''));
    s = side === 'w' ? 'b' : 'w';
    if (res !== '-') {
      const sw = [...res].map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()));
      reserve = sw.filter(c => c === c.toUpperCase()).join('') + sw.filter(c => c !== c.toUpperCase()).join('');
    }
  }
  const packed = rows.map(r => r.replace(/\.+/g, m => String(m.length))).join('/');
  return `${packed}[${reserve}] ${s} ${clock} ${no}`;
}
function tUci(u, t) {
  if (t.mirror) u = tMove(u, mirrorSq);
  if (t.swap) u = tMove(u, flipSq);
  return u;
}

// --- notation ---------------------------------------------------------------------------------
function san(pos, m) {
  const to = moveTo(m), drop = moveDrop(m);
  let t;
  if (drop) t = `${LET[drop]}@${sqn(to)}`;
  else {
    const from = moveFrom(m), type = pos.board[from] & 7, cap = !!pos.board[to];
    if (type === PAWN) t = (cap ? `${'abcdef'[from % 6]}x` : from % 6 !== to % 6 ? `${sqn(from)}-` : '') + sqn(to);
    else {
      let dis = '';
      const twins = pos.legalMoves().filter(x => !moveDrop(x) && x !== m && moveTo(x) === to && pos.board[moveFrom(x)] === pos.board[from]);
      if (twins.length) dis = twins.some(x => moveFrom(x) % 6 === from % 6) ? sqn(from)[1] : 'abcdef'[from % 6];
      t = LET[type] + dis + (cap ? 'x' : '') + sqn(to);
    }
  }
  pos.makeMove(m);
  if (!pos.hasLegalMove()) t += pos.inCheck() ? '#' : '';
  else if (pos.inCheck()) t += '+';
  pos.unmakeMove();
  return t;
}
const ordinal = r => r + ({ 1: 'st', 2: 'nd', 3: 'rd' }[r] || 'th');
const sanU = (pos, u) => san(pos, pos.moveFromUci(u));

// Squares a piece on `sq` attacks (pawns: straight ahead, and sideways in the enemy half).
function attacks(pos, sq) {
  const code = pos.board[sq], type = code & 7, col = code >> 3;
  const f = sq % 6, r = (sq / 6) | 0, out = [];
  const add = (df, dr) => {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 6 && rr >= 0 && rr < 6) out.push(rr * 6 + ff);
  };
  const ray = (df, dr) => {
    let ff = f + df, rr = r + dr;
    while (ff >= 0 && ff < 6 && rr >= 0 && rr < 6) {
      out.push(rr * 6 + ff);
      if (pos.board[rr * 6 + ff]) break;
      ff += df;
      rr += dr;
    }
  };
  if (type === KNIGHT) for (const [a, b] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) add(a, b);
  if (type === KING || type === QUEEN) for (const a of [-1, 0, 1]) for (const b of [-1, 0, 1]) if (a || b) add(a, b);
  if (type === BISHOP) for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) ray(a, b);
  if (type === ROOK) for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) ray(a, b);
  if (type === PAWN) {
    const dr = col === WHITE ? 1 : -1;
    add(0, dr);
    if (col === WHITE ? r >= 3 : r <= 2) {
      add(1, 0);
      add(-1, 0);
    }
  }
  return out;
}

// --- material ---------------------------------------------------------------------------------
function material(pos, c) {
  const board = [0, 0, 0, 0, 0, 0, 0], hand = [0, 0, 0, 0, 0, 0, 0];
  for (let sq = 0; sq < 36; sq++) {
    const code = pos.board[sq];
    if (code && code >> 3 === c && (code & 7) !== KING) board[code & 7]++;
  }
  for (const t of [PAWN, BISHOP, ROOK]) hand[t] = pos.hand[c][t];
  return { board, hand, n: board.reduce((a, b) => a + b, 0), h: hand.reduce((a, b) => a + b, 0) };
}
function listNames(parts) {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
function groupOf(kind, us, them, endsNoMove, oneMove) {
  if (kind === 'hold') return 'Holding the draw';
  if (us.h || them.h) return 'Drops from the reserve';
  if (oneMove && endsNoMove === 'stalemate') return 'Stalemate wins';
  const all = [PAWN, KNIGHT, BISHOP, ROOK, QUEEN].map(t => us.board[t] + them.board[t]);
  const has = t => all[[PAWN, KNIGHT, BISHOP, ROOK, QUEEN].indexOf(t)] > 0;
  const only = (m, types) => [PAWN, KNIGHT, BISHOP, ROOK, QUEEN].every(t => types.includes(t) || !m.board[t]);
  const bare = m => m.n === 0;
  if ((bare(them) && only(us, [KNIGHT, BISHOP])) || (bare(us) && only(them, [KNIGHT, BISHOP]))) return 'Minor pieces v bare king';
  if (has(QUEEN)) return 'Queen endings';
  if ((bare(them) && only(us, [ROOK])) || (bare(us) && only(them, [ROOK]))) return 'King and rook';
  if ((only(us, [ROOK]) && only(them, [PAWN]) && us.n && them.n) || (only(them, [ROOK]) && only(us, [PAWN]) && us.n && them.n)) return 'Rook against pawn';
  if (has(ROOK)) return 'Rook endings';
  if (only(us, [PAWN]) && only(them, [PAWN])) return 'Pawn endings';
  return 'Minor-piece endings';
}

// --- value strings from the tablebase ("w5" win in 5 plies for the mover, "d", "l4") ----------
const isWin = v => v[0] === 'w';
const plies = v => +v.slice(1);
const movesOf = p => Math.ceil(p / 2);

// --- one candidate -> one puzzle ---------------------------------------------------------------
function build(c, t, id) {
  const fen = tFen(c.fen, t);
  const pos = new Position(fen);
  const solver = pos.side, opp = solver ^ 1;
  const S = colorName(solver), O = colorName(opp);
  const hold = c.kind === 'hold';

  // Cut the line where the solution stops being unique.
  let steps = 0;
  for (let k = 0; k < c.steps.length; k++) {
    const st = c.steps[k];
    const ok = k === 0 || (st.opt.length <= 3 && (hold ? st.keep === 1 : c.kind === 'fast' || st.keep === st.opt.length));
    if (!ok || steps >= 6) break;
    steps++;
    if (2 * k + 1 >= c.line.length) break;
  }
  const rawLine = c.line.slice(0, 2 * steps - 1);
  const line = rawLine.map(u => tUci(u, t));
  const alts = c.steps.slice(0, steps).map((st, k) => st.opt.map(u => tUci(u, t)).filter(u => u !== line[2 * k]));

  // Walk the line for notation and the final position.
  const p2 = new Position(fen);
  const sans = [];
  for (const u of line) {
    sans.push(sanU(p2, u));
    p2.makeMove(p2.moveFromUci(u));
  }
  const fullLine = rawLine.length === c.line.length || 2 * steps - 1 >= c.line.length;
  if (c.kind === 'fast' && !fullLine) throw new Error('short finish cut before its end');
  const endState = !p2.hasLegalMove() ? (p2.inCheck() ? 'checkmate' : 'stalemate') : null;

  // The key move and what it does.
  const key = pos.moveFromUci(line[0]);
  const keySan = sans[0];
  const keyTo = moveTo(key), keyDrop = moveDrop(key);
  const keyType = keyDrop || (pos.board[moveFrom(key)] & 7);
  const captured = keyDrop ? 0 : pos.board[keyTo] & 7;
  const us = material(pos, solver), them = material(pos, opp);
  pos.makeMove(key);
  const gives = pos.inCheck();
  const targets = attacks(pos, keyTo).filter(s => pos.board[s] && pos.board[s] >> 3 === opp);
  const forkKing = targets.some(s => (pos.board[s] & 7) === KING);
  const forkPieces = targets.filter(s => (pos.board[s] & 7) !== KING && !pos.isAttacked(s, opp));
  const isFork = targets.length >= 2 && (forkKing ? forkPieces.length >= 1 : forkPieces.length >= 2) && keyType !== KING;
  const ks = pos.kingSq[solver], ko = pos.kingSq[opp];
  const between = (a, b, x) => (x > Math.min(a, b) && x < Math.max(a, b));
  const cutFile = keyType === ROOK && !gives && between(ks % 6, ko % 6, keyTo % 6) ? 'abcdef'[keyTo % 6] : null;
  const cutRank = keyType === ROOK && !gives && !cutFile && between(ks / 6 | 0, ko / 6 | 0, keyTo / 6 | 0) ? String((keyTo / 6 | 0) + 1) : null;
  const df = Math.abs(ks % 6 - ko % 6), dr = Math.abs((ks / 6 | 0) - (ko / 6 | 0));
  const opposition = keyType === KING && !captured && us.board[PAWN] + them.board[PAWN] > 0 && us.n + them.n === us.board[PAWN] + them.board[PAWN] && !us.h && !them.h && ((df === 0 && dr === 2) || (dr === 0 && df === 2));
  pos.unmakeMove();
  const zugzwang = !hold && c.null && !isWin(c.null) && !gives && !captured;
  const pawnSide = keyType === PAWN && !keyDrop && moveFrom(key) % 6 !== keyTo % 6;

  // Moves that fail, and the most tempting of them.
  const moveVals = c.moves.map(([u, v, r]) => ({ u: tUci(u, t), v, r: r && tUci(r, t) }));
  const total = moveVals.length;
  const good = moveVals.filter(x => (hold ? x.v[0] !== 'l' : isWin(x.v)));
  const fastest = hold ? good : good.filter(x => x.v === moveVals.find(y => y.u === line[0]).v);
  const bad = moveVals.filter(x => !(hold ? x.v[0] !== 'l' : isWin(x.v)));
  const tempt = m => {
    const mv = pos.moveFromUci(m.u);
    const capT = moveDrop(mv) ? 0 : pos.board[moveTo(mv)] & 7;
    pos.makeMove(mv);
    const chk = pos.inCheck();
    pos.unmakeMove();
    return (capT ? 10 + VALUE[capT] : 0) + (chk ? 6 : 0) + (moveDrop(mv) ? 3 : 0) + ((moveFrom(mv) === moveFrom(key) && !moveDrop(mv)) ? 2 : 0);
  };
  bad.forEach(b => (b.t = tempt(b)));
  bad.sort((a, b) => b.t - a.t || a.u.localeCompare(b.u));
  const wrong = bad[0];
  const trap = wrong && wrong.t >= 6;

  // --- themes ---------------------------------------------------------------------------------
  const themes = [];
  if (hold) themes.push('defence');
  else themes.push('endgameTechnique');
  if (fullLine && endState === 'checkmate') {
    themes.push('mate');
    if (steps <= 3) themes.push(`mateIn${steps}`);
  }
  if (fullLine && endState === 'stalemate') themes.push('stalemate');
  if (keyDrop) themes.push('drop');
  if (us.h || them.h) themes.push('reserve');
  if (isFork) themes.push(keyDrop ? 'dropFork' : 'fork');
  if (zugzwang) themes.push('zugzwang');
  if (opposition) themes.push('opposition');
  if (cutFile || cutRank) themes.push('cutOff');
  if (keyType === PAWN && !keyDrop) themes.push('pawnPush');
  if (!captured && !gives) themes.push('quiet');
  if (captured && them.n === 1 && !them.h) themes.push('hanging');

  // --- difficulty -------------------------------------------------------------------------------
  const d = c.dist;
  let raw = 0;
  raw += hold ? 6 : Math.min(d, 41) * 0.55;
  raw += (steps - 1) * 2.2;
  raw += !captured && !gives ? 3 : 0;
  raw += keyDrop ? 1 : 0;
  raw += trap ? 2.5 : 0;
  raw += zugzwang ? 3 : 0;
  raw += opposition ? 1.5 : 0;
  raw -= captured ? (them.n === 1 && !them.h ? 6 : 3) : 0;
  raw -= gives ? 1 : 0;
  raw += Math.log2(Math.max(2, total)) * 0.8;
  raw -= (fastest.length - 1) * 1.5;
  raw += rand() * 2;

  // --- words ----------------------------------------------------------------------------------
  const pName = NAME[keyType];
  const sents = [];
  const ofTotal = good.length === 1
    ? (total > 2 ? `It is the only one of ${S}'s ${total} legal moves that ${hold ? 'holds' : 'wins'}.` : '')
    : (hold ? '' : good.length === total ? `Every one of ${S}'s ${total} moves wins, but only ${listNames(fastest.map(x => sanU(pos, x.u)))} win${fastest.length === 1 ? 's' : ''} this fast.` : `Only ${good.length} of ${S}'s ${total} moves win${fastest.length < good.length ? `, and only ${listNames(fastest.map(x => sanU(pos, x.u)))} win${fastest.length === 1 ? 's' : ''} this fast` : ''}.`);

  // First sentence: what the key move does.
  const kSq = sqn(keyTo);
  let first;
  if (steps === 1 && endState === 'stalemate') {
    first = pick([
      `${keySan} leaves ${O}'s king without a single legal move. It is not check, but in Maki a player who cannot move loses, so this wins on the spot.`,
      `After ${keySan} ${O} has no legal move at all. No check is needed: stalemate is a win for ${S} in Maki.`,
      `${keySan} takes away ${O}'s last move. ${O} is not in check, yet the game is over, because the side with no legal move loses.`,
    ], id);
  } else if (steps === 1 && endState === 'checkmate') {
    first = `${keySan} is checkmate: the ${pName} gives check and every flight square of ${O}'s king is covered.`;
  } else if (hold && captured && them.n === 1 && !them.h) {
    first = `${keySan} removes ${O}'s last piece, and with bare kings and empty reserves the game is a draw.`;
  } else if (hold && captured) {
    first = `${keySan} takes the ${NAME[captured]} while there is still time; ${S} is worse, but after it the position holds.`;
  } else if (isFork) {
    const names = targets.filter(s => pos.board[s]).map(s => `${(pos.board[s] & 7) === KING ? 'king' : NAME[pos.board[s] & 7]} on ${sqn(s)}`);
    first = `${keyDrop ? `Dropping the ${pName} on ${kSq}` : keySan} attacks ${listNames(names)} at once${forkKing ? ', and the check has to be answered first' : ''}.`;
  } else if (cutFile || cutRank) {
    first = `${keySan} puts the rook between the kings and cuts ${O}'s king off along the ${cutFile ? `${cutFile}-file` : `${ordinal(cutRank)} rank`}, so it cannot come back to help.`;
  } else if (zugzwang) {
    first = pick([
      `${keySan} is a waiting move. If ${O} could pass, ${S} would not win${c.null === 'd' ? ' (it would be a draw)' : ''}, but ${O} must move and every move makes things worse.`,
      `The point of ${keySan} is to hand the move to ${O}: this is zugzwang. With ${S} to move again it would only be ${c.null === 'd' ? 'a draw' : 'bad for ' + S}, but ${O} has to give way.`,
    ], id);
  } else if (opposition) {
    first = `${keySan} takes the opposition: the kings face each other with one square between them and ${O} to move, so ${O}'s king must give ground.`;
  } else if (keyDrop) {
    first = `${keySan} brings the ${pName} in from the reserve exactly where it is needed${gives ? ', with check' : ''}. A drop costs a move, so it has to come at the right moment and on the right square.`;
  } else if (captured) {
    first = `${keySan} wins the ${NAME[captured]} on ${kSq}; ${them.n === 1 && !them.h ? `then ${O} is left with a bare king` : `that is the capture that keeps the win`}.`;
  } else if (pawnSide) {
    first = `${keySan} is a sideways pawn step, which a pawn may make only in the enemy half; it is the move that ${hold ? 'saves the game' : 'wins'}.`;
  } else if (keyType === PAWN) {
    first = `The pawn step ${keySan} ${hold ? 'is what holds' : 'decides the game'}${gives ? ': it gives check' : ''}.`;
  } else if (gives) {
    first = `${keySan} gives check from ${kSq}${hold ? ' and keeps the draw' : ''}, and ${O}'s king has to step where ${S} wants it.`;
  } else if (keyType === KING) {
    first = hold
      ? `${keySan}: the king steps to the one square from which it can still fight ${O}'s ${them.board[PAWN] && them.n === 1 ? 'pawn' : 'pieces'}.`
      : `${keySan}: the king walks up first. ${S}'s king has to help ${them.n === 0 && !them.h ? 'herd the bare king' : 'the pieces'}, and this is the only square that does it fast enough.`;
  } else {
    first = hold
      ? `${keySan} puts the ${pName} on ${kSq}, the only square where it keeps ${O} from making progress.`
      : `${keySan} puts the ${pName} on ${kSq}, where it takes squares away from ${O}'s king without giving it a target.`;
  }
  sents.push(first);

  // Second: the line.
  if (steps > 1) {
    const rest = sans.slice(2).join(' ');
    let tail = '';
    if (fullLine && endState === 'stalemate') tail = `, and ${O} is left with no legal move, which loses.`;
    else if (fullLine && endState === 'checkmate') tail = ', checkmate.';
    else if (!hold) tail = `, and the win is in hand (${movesOf(plies(moveVals.find(y => y.u === line[0]).v))} moves in all with best play).`;
    else tail = '; the draw is safe.';
    sents.push(`${O}'s ${hold ? 'best try' : 'best defence'} is ${sans[1]}, and play goes on ${rest}${tail}`.replace(' go on ,', ','));
  } else if (!endState && !hold) {
    const rep = c.line[1] ? sanU(p2, tUci(c.line[1], t)) : null;
    sents.push(`With best play ${S} wins in ${movesOf(c.dist)} moves${rep ? `; ${O}'s most stubborn reply is ${rep}` : ''}.`);
  }

  // Third: the tempting wrong move.
  if (wrong) {
    const wp = new Position(fen);
    const wSan = sanU(wp, wrong.u);
    wp.makeMove(wp.moveFromUci(wrong.u));
    const rSan = wrong.r ? sanU(wp, wrong.r) : null;
    let what;
    if (wrong.v === 'd') what = hold ? 'is fine too' : 'only draws';
    else if (wrong.v[0] === 'l') what = `${hold ? 'loses' : 'even loses'}: ${O} then wins in ${movesOf(plies(wrong.v) - 1)}`;
    else what = `also wins, but takes ${movesOf(plies(wrong.v))} moves instead of ${movesOf(c.dist)}`;
    if (rSan) sents.push(`${trap ? `The tempting ${wSan}` : `${wSan}`}? ${what.replace(/^(\w)/, (m) => m)}${wrong.v === 'd' ? `: ${O} answers ${rSan}` : ` after ${rSan}`}${wrong.v === 'd' ? ' and holds' : ''}.`);
    else sents.push(`${wSan}? ${what}.`);
  }
  if (ofTotal) sents.push(ofTotal);

  const explain = sents.join(' ').replace(/\s+/g, ' ').replace(/\.\./g, '.').trim();

  // --- title, goal, result --------------------------------------------------------------------
  let title;
  if (hold) title = `Only ${keySan.replace(/[+#]/, '')} holds`;
  else if (steps === 1 && endState === 'stalemate') title = `No moves left after ${keySan}`;
  else if (endState === 'checkmate' && fullLine) {
    const last = new Position(fen);
    line.slice(0, -1).forEach(u => last.makeMove(last.moveFromUci(u)));
    const lm = last.moveFromUci(line[line.length - 1]);
    const dropIn = line.some((u, i) => i % 2 === 0 && u[1] === '@');
    title = dropIn && steps > 1 ? `Drop and mate in ${steps}` : `Mate with the ${NAME[moveDrop(lm) || (last.board[moveFrom(lm)] & 7)]}${steps > 1 ? ` in ${steps}` : ''}`;
  }
  else if (isFork) title = `${keyDrop ? 'Drop fork' : 'Fork'} on ${kSq}`;
  else if (cutFile || cutRank) title = `Cut off on the ${cutFile ? cutFile + '-file' : ordinal(cutRank) + ' rank'}`;
  else if (zugzwang) title = `Zugzwang with ${keySan.replace(/[+#]/, '')}`;
  else if (opposition) title = `Take the opposition`;
  else if (keyDrop) title = `The right drop: ${keySan.replace(/[+#]/, '')}`;
  else if (pawnSide) title = `Sideways pawn step`;
  else if (captured) title = `Take the ${NAME[captured]} on ${kSq}`;
  else if (keyType === KING) title = pick([`King to ${kSq} first`, `The king leads: ${keySan.replace(/[+#]/, '')}`, `Only ${keySan.replace(/[+#]/, '')} wins`], id);
  else title = pick([`${pName[0].toUpperCase()}${pName.slice(1)} to ${kSq}`, `Only ${keySan.replace(/[+#]/, '')} wins`, `Find the ${pName} move`], id);
  if (title.length > 40) title = title.slice(0, 40);

  const goal = hold
    ? `${S} to move and hold the draw`
    : fullLine && endState
      ? `${S} to move and win in ${steps} move${steps > 1 ? 's' : ''}`
      : `${S} to move and win`;
  const keyV = moveVals.find(y => y.u === line[0]).v;
  const result = hold
    ? 'Draw (tablebase)'
    : fullLine && endState === 'checkmate'
      ? `Checkmate in ${steps}`
      : fullLine && endState === 'stalemate'
        ? `Stalemate win in ${steps}`
        : `Wins in ${movesOf(plies(keyV))} (tablebase)`;
  const group = groupOf(c.kind, us, them, endState, steps === 1 && fullLine);

  return {
    id, fen, line, alts: alts.some(a => a.length) ? alts : undefined, raw, themes: [...new Set(themes)],
    group, title, goal, explain, result, source: 'tablebase',
    sig: c.sig, kind: c.kind, trivial: captured && them.n === 1 && !them.h,
  };
}

// --- selection --------------------------------------------------------------------------------
function main() {
  const [candFile, outFile = path.join(__dirname, '../../web/train/endgames.js')] = process.argv.slice(2);
  const cands = fs.readFileSync(candFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const bySig = new Map();
  for (const c of cands) {
    const k = `${c.sig}:${c.kind}`;
    if (!bySig.has(k)) bySig.set(k, []);
    bySig.get(k).push(c);
  }
  const built = [];
  let n = 0;
  for (const [k, list] of [...bySig].sort()) {
    const out = [];
    for (const c of list) {
      const t = { mirror: rand() < 0.5, swap: rand() < 0.5 };
      try {
        const p = build(c, t, `x${n++}`);
        out.push(p);
      } catch (e) {
        console.error(`skip ${k}: ${e.message}`);
      }
    }
    // Interest: longer unique lines, traps, ideas; few trivial captures.
    for (const p of out) {
      p.interest = p.line.length / 2 + (p.themes.includes('zugzwang') ? 2 : 0) + (p.themes.includes('cutOff') ? 1.5 : 0)
        + (p.themes.includes('opposition') ? 1.5 : 0) + (p.themes.includes('fork') || p.themes.includes('dropFork') ? 1.5 : 0)
        + (/tempting/.test(p.explain) ? 1.5 : 0) + (p.trivial ? -4 : 0) + rand();
    }
    out.sort((a, b) => b.interest - a.interest);
    bySig.set(k, out);
  }
  // Fill a quota per group, round robin over (signature, kind) inside each group, so every
  // ending is represented; then top up with the most interesting leftovers.
  const QUOTA = {
    'Stalemate wins': 18, 'Minor pieces v bare king': 25, 'King and rook': 20, 'Queen endings': 25,
    'Rook against pawn': 16, 'Rook endings': 25, 'Minor-piece endings': 25, 'Pawn endings': 25,
    'Drops from the reserve': 55, 'Holding the draw': 36,
  };
  const TARGET = 270;
  const chosen = [];
  const seen = new Set();
  const take = p => {
    const key = p.fen.split(' ').slice(0, 2).join(' ');
    if (seen.has(key) || p.taken) return false;
    seen.add(key);
    p.taken = true;
    chosen.push(p);
    return true;
  };
  for (const g of Object.keys(QUOTA)) {
    const lists = [...bySig.values()].map(l => l.filter(p => p.group === g && !(p.trivial && g !== 'Holding the draw'))).filter(l => l.length);
    let got = 0, trivial = 0;
    for (let round = 0; got < QUOTA[g] && round < 40; round++) {
      const picks = lists.map(l => l[round]).filter(Boolean).sort((a, b) => b.interest - a.interest);
      for (const p of picks) {
        if (got >= QUOTA[g]) break;
        if (p.trivial && ++trivial > 4) continue;
        if (take(p)) got++;
      }
    }
  }
  const rest = [...bySig.values()].flat().filter(p => !p.taken && !p.trivial).sort((a, b) => b.interest - a.interest);
  for (const p of rest) {
    if (chosen.length >= TARGET) break;
    take(p);
  }
  // Ratings: rank the raw difficulty and spread it over 650..2350, so every level is well used.
  const order = [...chosen].sort((a, b) => a.raw - b.raw);
  order.forEach((p, i) => {
    p.rating = Math.round((650 + (1600 * i) / (order.length - 1)) / 10) * 10;
    p.level = p.rating < 1000 ? 1 : p.rating < 1300 ? 2 : p.rating < 1600 ? 3 : p.rating < 1900 ? 4 : 5;
  });
  // Stable ids: by group, then rating.
  const groups = ['Stalemate wins', 'Minor pieces v bare king', 'King and rook', 'Queen endings', 'Rook against pawn', 'Rook endings',
    'Minor-piece endings', 'Pawn endings', 'Drops from the reserve', 'Holding the draw'];
  chosen.sort((a, b) => groups.indexOf(a.group) - groups.indexOf(b.group) || a.rating - b.rating || a.fen.localeCompare(b.fen));
  chosen.forEach((p, i) => (p.id = `e${String(i + 1).padStart(4, '0')}`));
  for (const p of chosen) p.explain = p.explain.replace(/\bx\d+\b/g, '');

  const fields = ['id', 'fen', 'line', 'alts', 'rating', 'level', 'themes', 'group', 'title', 'goal', 'explain', 'result', 'source'];
  const rows = chosen.map(p => {
    const o = {};
    for (const f of fields) if (p[f] !== undefined) o[f] = p[f];
    return `    ${JSON.stringify(o)},`;
  });
  const js = `'use strict';
// Train section, endgame puzzles: ${chosen.length} positions solved exactly by the tablebases
// (crates/tb, \`sk-tb puzzles\`), picked and explained by tools/train/gen-endgames.js.
(function (root) {
  const DATA = [
${rows.join('\n')}
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else (root.TrainData = root.TrainData || {}).endgames = DATA;
})(typeof self !== 'undefined' ? self : this);
`;
  fs.writeFileSync(outFile, js);
  const count = (f) => chosen.reduce((m, p) => ((m[f(p)] = (m[f(p)] || 0) + 1), m), {});
  console.log(`${outFile}: ${chosen.length} puzzles`);
  console.log('levels', count(p => p.level));
  console.log('groups', count(p => p.group));
  console.log('solver', count(p => p.fen.split(' ')[1]));
}

if (require.main === module) main();
module.exports = { tFen, tUci, san };
