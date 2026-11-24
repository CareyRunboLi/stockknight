'use strict';
// Turns the raw candidates from `sk-puzzlegen gen` into the middlegame puzzles of the Train
// section (web/train/tactics.js): checks every line with the reference engine, detects the
// themes, estimates the difficulty and writes the explanations.
//   node tools/train/build-tactics.js raw.jsonl [more.jsonl ...] web/train/tactics.js
const fs = require('node:fs');
const SK = require('../../reference/engine.js');
const { Position, WHITE, PAWN, KNIGHT, BISHOP, ROOK, QUEEN, KING, moveFrom, moveTo, moveDrop, sqName, PAWN_STEPS } = SK;

const MATE = SK.MATE;
const NAME = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const LETTER = ['', '', 'N', 'B', 'R', 'Q', 'K'];
const DROP_LETTER = ['', 'P', '', 'B', 'R'];
const VAL = [0, 1, 4.25, 3.75, 6.25, 5, 50];
const HAND_VAL = [0, 1.7, 0, 4.25, 6.5];
const colorName = c => (c === WHITE ? 'White' : 'Black');
const typeOf = code => code & 7;
const colorOf = code => code >> 3;

// --- geometry --------------------------------------------------------------------------------

const fileOf = sq => sq % 6, rankOf = sq => (sq / 6) | 0;
function steps(deltas) {
  return Array.from({ length: 36 }, (_, sq) => deltas
    .map(([df, dr]) => [fileOf(sq) + df, rankOf(sq) + dr])
    .filter(([f, r]) => f >= 0 && f < 6 && r >= 0 && r < 6)
    .map(([f, r]) => r * 6 + f));
}
const KNIGHT_J = steps([[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]);
const KING_S = steps([[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]]);
const DIAG = [[1, 1], [1, -1], [-1, -1], [-1, 1]], ORTHO = [[0, 1], [1, 0], [0, -1], [-1, 0]];

// Squares the piece on `sq` attacks.
function attacks(board, sq) {
  const code = board[sq], t = typeOf(code), c = colorOf(code);
  if (t === PAWN) return PAWN_STEPS[c][sq];
  if (t === KNIGHT) return KNIGHT_J[sq];
  if (t === KING || t === QUEEN) return KING_S[sq];
  const out = [];
  for (const [df, dr] of t === BISHOP ? DIAG : ORTHO) {
    let f = fileOf(sq) + df, r = rankOf(sq) + dr;
    while (f >= 0 && f < 6 && r >= 0 && r < 6) {
      const s = r * 6 + f;
      out.push(s);
      if (board[s]) break;
      f += df;
      r += dr;
    }
  }
  return out;
}

function material(pos, color) {
  let v = 0;
  for (let sq = 0; sq < 36; sq++) {
    const code = pos.board[sq];
    if (code && colorOf(code) === color && typeOf(code) !== KING) v += VAL[typeOf(code)];
  }
  for (const t of [PAWN, BISHOP, ROOK]) v += pos.hand[color][t] * HAND_VAL[t];
  return v;
}

// --- notation --------------------------------------------------------------------------------

// Short algebraic: Nc3, Rxd4, dxc4, R@c4, with + for check and # for checkmate.
function san(pos, m) {
  const to = moveTo(m), drop = moveDrop(m);
  let text;
  if (drop) text = `${DROP_LETTER[drop]}@${sqName(to)}`;
  else {
    const from = moveFrom(m), code = pos.board[from], t = typeOf(code);
    const cap = pos.board[to] ? 'x' : '';
    if (t === PAWN) text = cap ? `${sqName(from)}x${sqName(to)}` : sqName(to);
    else {
      const twins = pos.legalMoves().filter(x => !moveDrop(x) && x !== m && moveTo(x) === to && pos.board[moveFrom(x)] === code);
      let dis = '';
      if (twins.length) {
        dis = twins.some(x => fileOf(moveFrom(x)) === fileOf(from))
          ? (twins.some(x => rankOf(moveFrom(x)) === rankOf(from)) ? sqName(from) : String(rankOf(from) + 1))
          : 'abcdef'[fileOf(from)];
      }
      text = LETTER[t] + dis + cap + sqName(to);
    }
  }
  pos.makeMove(m);
  if (pos.inCheck()) text += pos.hasLegalMove() ? '+' : '#';
  pos.unmakeMove();
  return text;
}

function lineText(fen, moves, startPly = 0) {
  const pos = new Position(fen);
  const out = [];
  let no = pos.moveNo;
  for (let i = 0; i < moves.length; i++) {
    const m = pos.moveFromUci(moves[i]);
    const s = san(pos, m);
    if (pos.side === WHITE) out.push(`${no}. ${s}`);
    else out.push(i === 0 ? `${no}… ${s}` : s);
    if (pos.side !== WHITE) no++;
    pos.makeMove(m);
  }
  return out.join(' ');
}

// --- scores ----------------------------------------------------------------------------------

const parseScore = s => (typeof s === 'string' ? (s[1] === '-' ? -(MATE - +s.slice(2)) : MATE - +s.slice(1)) : s);
const isMate = s => s >= MATE - 1000;
const pawns = cp => `${cp >= 0 ? '+' : '−'}${(Math.abs(cp) / 100).toFixed(1)}`;
function scoreWords(cp) {
  if (cp >= MATE - 1000) return 'a forced win';
  if (cp <= -(MATE - 1000)) return 'a forced loss';
  return pawns(cp);
}

// Deterministic choice of phrasing.
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const pick = (arr, seed) => arr[seed % arr.length];
const cap = s => s[0].toUpperCase() + s.slice(1);
function list(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
const article = w => (/^[aeiou]/.test(w) ? `an ${w}` : `a ${w}`);

// --- analysis of one candidate ---------------------------------------------------------------

function analyse(raw) {
  const pos = new Position(raw.fen);
  const solver = pos.side, opp = solver ^ 1;
  const moves = [];
  const p = new Position(raw.fen);
  for (const u of raw.line) {
    const m = p.moveFromUci(u);
    if (!m) throw new Error(`illegal ${u} in ${raw.fen}`);
    moves.push(m);
    p.makeMove(m);
  }
  if (raw.line.length % 2 === 0) throw new Error('line must end with a solver move');
  const finalTerminal = !p.hasLegalMove();
  const finalMate = finalTerminal && p.inCheck();
  const solverMoves = (raw.line.length + 1) / 2;

  const top = raw.steps[0].top.map(([u, s]) => ({ u, s: parseScore(s) }));
  const best = top[0].s, second = top[1] ? top[1].s : null;

  // Key move facts.
  const key = moves[0];
  const from = moveFrom(key), to = moveTo(key), drop = moveDrop(key);
  const moverType = drop || typeOf(pos.board[from]);
  const captured = pos.board[to] ? typeOf(pos.board[to]) : 0;
  const capturedUndefended = captured && !pos.isAttacked(to, opp);
  const p1 = new Position(raw.fen);
  p1.makeMove(key);
  const givesCheck = p1.inCheck();
  const targets = [];
  for (const s of attacks(p1.board, to)) {
    const c = p1.board[s];
    if (!c || colorOf(c) !== opp) continue;
    const t = typeOf(c);
    if (t === KING || (t !== PAWN && (VAL[t] > VAL[moverType] + 0.3 || !p1.isAttacked(s, opp)))) targets.push({ sq: s, t });
  }
  const fork = targets.length >= 2 && (targets.some(x => x.t === KING) || targets.filter(x => VAL[x.t] >= 3.7).length >= 2);
  const moverAttacksKing = attacks(p1.board, to).includes(p1.kingSq[opp]);
  const discovered = givesCheck && !moverAttacksKing && !drop;
  // A sacrifice: the opponent takes the piece that just moved or dropped, and that piece was
  // worth clearly more than what it captured.
  let sacrifice = false;
  if (raw.line.length > 1) {
    const reply = moves[1];
    if (moveTo(reply) === to && !moveDrop(reply)) {
      sacrifice = VAL[moverType] > VAL[captured] + 0.7 && moverType !== KING;
    }
  }
  // Pieces won and lost along the line.
  const gained = [], lost = [];
  const q = new Position(raw.fen);
  moves.forEach((m, i) => {
    const c = q.board[moveTo(m)];
    if (c && !moveDrop(m)) (i % 2 === 0 ? gained : lost).push({ t: typeOf(c), sq: moveTo(m) });
    q.makeMove(m);
  });
  const matDelta = (material(q, solver) - material(q, opp)) - (material(pos, solver) - material(pos, opp));
  // Does the opponent get anything back straight away after the line?
  let recapture = 0;
  if (!finalTerminal) {
    for (const m of q.legalMoves()) {
      const c = q.board[moveTo(m)];
      if (c && !moveDrop(m)) recapture = Math.max(recapture, VAL[typeOf(c)] - (q.isAttacked(moveTo(m), solver) ? VAL[typeOf(q.board[moveFrom(m)])] : 0));
    }
  }
  const quiet = !captured && !givesCheck;
  const checks = moves.filter((m, i) => {
    if (i % 2) return false;
    return true;
  }).length;

  return {
    raw, pos, solver, opp, moves, finalTerminal, finalMate, solverMoves, top, best, second,
    key, from, to, drop, moverType, captured, capturedUndefended, givesCheck, targets, fork,
    discovered, sacrifice, gained, lost, matDelta, recapture, quiet, checks, finalPos: q,
  };
}

// --- themes, difficulty, text ----------------------------------------------------------------

function themesOf(a) {
  const th = [];
  const defence = a.raw.kind === 'defence';
  if (a.finalTerminal && a.finalMate) {
    th.push('mate');
    th.push(a.solverMoves === 1 ? 'mateIn1' : a.solverMoves === 2 ? 'mateIn2' : 'mateIn3');
  } else if (a.finalTerminal) th.push('stalemate');
  if (a.drop) th.push('drop');
  if (a.fork) th.push(a.drop ? 'dropFork' : 'fork');
  if (a.discovered) th.push('discovered');
  if (a.sacrifice) th.push('sacrifice');
  if (a.captured && a.capturedUndefended && !a.finalTerminal && !a.fork && VAL[a.captured] >= 1) th.push('hanging');
  if (a.quiet) th.push('quiet');
  if (defence) th.push('defence');
  if (a.moverType === PAWN && !a.captured && !a.drop) th.push('pawnPush');
  if (a.drop && a.pos.hand[a.solver][a.drop] > 0) th.push('reserve');
  const checksInLine = [];
  const p = new Position(a.raw.fen);
  a.moves.forEach((m, i) => {
    p.makeMove(m);
    if (i % 2 === 0 && p.inCheck()) checksInLine.push(i);
  });
  if (checksInLine.length >= 2) th.push('kingHunt');
  if (!th.length) th.push(a.captured ? 'hanging' : a.givesCheck ? 'kingHunt' : 'quiet');
  return [...new Set(th)];
}

function groupOf(a, th) {
  if (th.includes('mateIn1')) return 'Mate in 1';
  if (th.includes('mateIn2')) return 'Mate in 2';
  if (th.includes('mateIn3')) return 'Mate in 3 or more';
  if (th.includes('stalemate')) return 'Stalemate wins';
  if (th.includes('defence')) return 'Only moves';
  if (th.includes('dropFork') || th.includes('fork')) return 'Forks';
  if (th.includes('drop')) return 'Drop tactics';
  if (th.includes('sacrifice')) return 'Sacrifices';
  if (th.includes('discovered')) return 'Discovered attacks';
  if (th.includes('kingHunt')) return 'King hunts';
  if (th.includes('hanging') && a.capturedUndefended) return 'Loose pieces';
  if (th.includes('quiet')) return 'Quiet moves';
  return 'Winning material';
}

function rawDifficulty(a, th) {
  const st = a.raw.steps[0];
  let r = 700;
  r += 140 * Math.max(0, st.find - 1);
  r += 160 * (a.solverMoves - 1);
  if (a.quiet) r += 220;
  if (a.sacrifice) r += 200;
  if (a.drop) r += 80;
  if (th.includes('defence')) r += 200;
  if (th.includes('stalemate')) r += 150;
  if (th.includes('hanging') && a.capturedUndefended) r -= 250;
  if (a.givesCheck && a.solverMoves === 1) r -= 80;
  if (a.finalTerminal && a.solverMoves === 1) r -= 100;
  if (a.captured && VAL[a.captured] >= 4 && a.raw.line.length === 1) r -= 120;
  // Many plausible moves make it harder to spot.
  r += Math.min(150, a.pos.legalMoves().length * 2);
  return r;
}

const levelOf = rating => (rating < 1000 ? 1 : rating < 1300 ? 2 : rating < 1600 ? 3 : rating < 1900 ? 4 : 5);

function pieceOn(pos, sq) {
  const c = pos.board[sq];
  return `${NAME[typeOf(c)]} on ${sqName(sq)}`;
}

function explain(a, th, id) {
  const seed = hash(id + a.raw.fen);
  const S = colorName(a.solver), O = colorName(a.opp);
  const pos = new Position(a.raw.fen);
  const keySan = san(pos, a.key);
  const sentences = [];
  const moverName = NAME[a.moverType];
  const defence = th.includes('defence');

  // What the key move does.
  if (defence) {
    const what = a.best >= 100 ? `${S}'s advantage` : a.best <= -100 ? `${S} fighting` : 'the balance';
    const holds = pick([
      `${O} threatens to take over, and ${keySan} is the only move that keeps ${what}.`,
      `Almost every move goes wrong here: ${keySan} is the one that keeps ${what}.`,
      `${S} is in danger, and only ${keySan} keeps ${what}.`,
    ], seed);
    if (a.captured && !pos.inCheck()) {
      sentences.push(pick([
        `${keySan} takes the ${NAME[a.captured]} on ${sqName(a.to)}, and it has to be now: every other move leaves ${S} worse off.`,
        `Material is at stake: ${keySan} grabs the ${NAME[a.captured]} on ${sqName(a.to)} before it causes damage, and that is the only move that keeps ${what}.`,
      ], seed));
    } else {
      sentences.push(holds);
    }
    const threat = threatOf(pos, a.opp);
    if (threat && !pos.inCheck()) sentences.push(`${O} is threatening ${threat.text}.`);
    if (pos.inCheck()) sentences.push(`${S} is in check, and the other ways out of it walk into a winning follow-up for ${O}.`);
  } else if (a.finalTerminal) {
    const k = a.finalPos.kingSq[a.opp];
    if (a.solverMoves === 1) {
      if (a.finalMate) {
        sentences.push(pick([
          `${keySan} gives check, and the ${O.toLowerCase()} king on ${sqName(k)} has no square to go to and nothing can block or capture the checking piece.`,
          `${keySan} is checkmate: the king on ${sqName(k)} is attacked, and every flight square is covered.`,
          `After ${keySan} the ${O.toLowerCase()} king on ${sqName(k)} is in check with no way out.`,
        ], seed));
      } else {
        sentences.push(`${keySan} does not even give check, but afterwards ${O} has no legal move at all, and in Maki the side with no legal move loses.`);
      }
      if (a.drop) sentences.push(`The ${moverName} comes from the reserve: a drop can land exactly where it is needed.`);
    } else {
      const full = lineText(a.raw.fen, a.raw.line);
      if (a.finalMate) {
        sentences.push(pick([
          `${keySan} starts a forced mate in ${a.solverMoves}: ${full}.`,
          `The win is forced: ${full}, and the king on ${sqName(k)} is mated.`,
          `${keySan}! leads to mate in ${a.solverMoves}. The full line is ${full}.`,
        ], seed));
      } else {
        sentences.push(`${keySan} forces the win in ${a.solverMoves} moves: ${full}. At the end ${O} is not in check, but has no legal move, and that loses.`);
      }
      const p2 = new Position(a.raw.fen);
      p2.makeMove(a.key);
      const reply = p2.moveFromUci(a.raw.line[1]);
      const checking = solverChecks(a);
      if (a.sacrifice) sentences.push(`Giving up the ${moverName} is the point: once ${O} takes it with ${san(p2, reply)}, the king is too exposed.`);
      else if (checking.every(Boolean)) sentences.push(pick([
        `Every ${S.toLowerCase()} move is a check, so ${O} never gets a moment to bring help.`,
        `Each move checks, which keeps ${O}'s replies down to a handful.`,
      ], seed));
      else if (!checking[0]) sentences.push(`The first move is quiet, which is what makes it hard to see: ${O} gets a free move but cannot stop the threat.`);
      else sentences.push(`Not every move is a check: the quiet ${san(afterN(a, 2 * checking.indexOf(false)), afterN(a, 2 * checking.indexOf(false)).moveFromUci(a.raw.line[2 * checking.indexOf(false)]))} in the middle is the move to find.`);
      const drops = a.raw.line.filter((u, i) => i % 2 === 0 && u.includes('@'));
      if (drops.length >= 2) sentences.push(`Both drops matter: the reserve lets ${S} put pieces right next to the king, where nothing on the board could arrive in time.`);
    }
  } else {
    // Material.
    const won = a.gained.map(g => g.t).sort((x, y) => VAL[y] - VAL[x]);
    const top = won[0];
    if (a.fork) {
      const tg = a.targets.map(t => (t.t === KING ? 'the king' : `the ${NAME[t.t]} on ${sqName(t.sq)}`));
      if (a.captured) sentences.push(`${keySan} takes the ${NAME[a.captured]} on ${sqName(a.to)}, and the ${moverName} now attacks ${list(tg)}.`);
      else sentences.push(pick([
        `${keySan} attacks ${list(tg)} at the same time${a.drop ? `, straight from the reserve` : ''}.`,
        `${a.drop ? `Dropping the ${moverName} on ${sqName(a.to)}` : keySan} forks ${list(tg)}.`,
        `A double attack: after ${keySan} the ${moverName} on ${sqName(a.to)} hits ${list(tg)}.`,
      ], seed));
      sentences.push(a.targets.some(t => t.t === KING)
        ? `${O} has to deal with the check first, and ${forkFollow(a)}.`
        : `${O} can only save one of them.`);
    } else if (a.discovered) {
      sentences.push(`${keySan} uncovers a check from a piece behind it, so the moving ${moverName} is free to go where it likes${a.captured ? ` and it takes the ${NAME[a.captured]} on the way` : ''}.`);
    } else if (a.captured && a.capturedUndefended) {
      sentences.push(pick([
        `The ${NAME[a.captured]} on ${sqName(a.to)} is not defended: ${keySan} simply wins it.`,
        `Nothing protects the ${NAME[a.captured]} on ${sqName(a.to)}, so ${keySan} takes it for free.`,
        `Count the defenders of ${sqName(a.to)}: there are none. ${keySan} wins a ${NAME[a.captured]}.`,
      ], seed));
    } else if (a.sacrifice) {
      const p2 = afterN(a, 1);
      const reply = p2.moveFromUci(a.raw.line[1]);
      const follow = a.raw.line.length >= 3 ? san(afterN(a, 2), afterN(a, 2).moveFromUci(a.raw.line[2])) : '';
      sentences.push(`${keySan} offers the ${moverName}. ${O} takes it with ${san(p2, reply)}${follow ? `, and ${follow} shows the point` : ''}${top && VAL[top] > VAL[a.moverType] ? `: ${S} gets the ${NAME[top]} in return` : ''}.`);
    } else if (a.drop) {
      const tg = a.targets.map(t => (t.t === KING ? 'the king' : `the ${NAME[t.t]} on ${sqName(t.sq)}`));
      sentences.push(`${keySan} puts a ${moverName} from the reserve onto ${sqName(a.to)}${tg.length ? `, attacking ${list(tg)}` : ''}.`);
      if (a.givesCheck) sentences.push(`Because it comes with check, ${O} has no time to save everything.`);
    } else if (a.quiet) {
      const fresh = newlyAttacked(a).map(sq => `the ${NAME[typeOf(a.pos.board[sq])]} on ${sqName(sq)}`);
      const boxed = kingSquaresTaken(a);
      let what;
      if (fresh.length) what = ` that puts ${list(fresh)} under attack`;
      else if (boxed.length >= 2) what = ` that takes ${list(boxed.map(sqName))} away from the ${O.toLowerCase()} king`;
      else what = ' that sets up a threat';
      sentences.push(`${keySan} is a quiet move${what}, and ${O} has no good way to meet it.`);
      const threat = threatOf(afterN(a, 1), a.solver);
      if (threat) sentences.push(`The threat is ${threat.text}.`);
      const pv = a.raw.steps[0].pv || [];
      if (a.raw.line.length === 1 && pv.length >= 3) {
        try { sentences.push(`A likely continuation is ${lineText(a.raw.fen, pv.slice(0, Math.min(pv.length, 5)))}.`); } catch {}
      }
    } else if (a.captured) {
      if (a.moverType === KING) sentences.push(`${keySan} takes the ${NAME[a.captured]} on ${sqName(a.to)} with the king: ${O} cannot touch a king, so the only question is whether ${sqName(a.to)} is safe, and it is.`);
      else if (VAL[a.moverType] + 0.5 < VAL[a.captured]) sentences.push(`${keySan} takes the ${NAME[a.captured]} on ${sqName(a.to)}${a.givesCheck ? ' with check' : ''}. It is defended, but the ${moverName} is worth less, so the trade favours ${S}.`);
      else sentences.push(`${keySan} takes the ${NAME[a.captured]} on ${sqName(a.to)}${a.givesCheck ? ' with check' : ''}. It looks defended, but ${O} cannot afford to recapture.`);
    } else if (a.givesCheck) {
      sentences.push(`${keySan} comes with check and gains the time ${S} needs to win material.`);
    } else {
      sentences.push(`${keySan} wins material by force.`);
    }
    const pv = a.raw.steps[0].pv || [];
    if (a.raw.line.length === 1 && !a.captured && !a.quiet && pv.length >= 3) {
      try { sentences.push(`A likely continuation is ${lineText(a.raw.fen, pv.slice(0, Math.min(pv.length, 5)))}.`); } catch {}
    }
    if (a.raw.line.length >= 3 && !a.fork && !a.sacrifice) {
      sentences.push(`The main line is ${lineText(a.raw.fen, a.raw.line)}.`);
    } else if (a.raw.line.length >= 3 && a.fork) {
      sentences.push(`Main line: ${lineText(a.raw.fen, a.raw.line)}.`);
    }
      }

  // The natural alternative, scored from the solver's side.
  if (a.top[1]) {
    const alt = a.top[1];
    const altMove = pos.moveFromUci(alt.u);
    const altSan = san(pos, altMove);
    const altTxt = alt.s <= -(MATE - 1000) ? `loses by force` : alt.s >= MATE - 1000 ? 'wins more slowly' : `${pawns(alt.s)} for ${S}`;
    const bestTxt = isMate(a.best) ? 'a forced win' : `${pawns(a.best)}`;
    if (defence) {
      sentences.push(alt.s <= -150
        ? pick([
          alt.s <= -(MATE - 1000) ? `The next best try, ${altSan}, already loses by force.` : `The next best try, ${altSan}, already loses: Stockhorse scores it ${altTxt}.`,
          alt.s <= -(MATE - 1000) ? `Compare ${altSan}, which looks reasonable but loses by force.` : `Compare ${altSan}, which looks reasonable but scores ${altTxt}.`,
        ], seed >>> 3)
        : `The next best try, ${altSan}, is clearly worse (${altTxt}, against ${pawns(a.best)}).`);
    } else {
      sentences.push(alt.s <= -(MATE - 1000)
        ? `Be careful: the natural-looking ${altSan} even loses by force.`
        : pick([
          `The second-best move, ${altSan}, is only worth ${altTxt}, against ${bestTxt} for ${keySan}.`,
          `The natural-looking ${altSan} gives just ${altTxt}.`,
          `Other moves let ${O} off the hook: the best of them, ${altSan}, scores ${altTxt}.`,
        ], seed >>> 3));
    }
  }
  // A one-line idea (usually a free piece with no close second move) gets the lesson behind it.
  if (sentences.join(' ').length < 90 && a.captured) {
    sentences.push(pick([
      `Before looking for anything clever, check every enemy piece for defenders: a loose ${NAME[a.captured]} is free material.`,
      `Each move, ask what the last move left unprotected; here it is the ${NAME[a.captured]}.`,
      `Free material is the simplest tactic of all, and the easiest to overlook when you are busy with your own plans.`,
    ], seed >>> 5));
  }
  if (sentences.join(' ').length < 90 && defence) {
    sentences.push(pick([
      `When ${O} is pressing, look at every forcing move before settling on a plan: checks and captures first, then the quiet moves: here only one move keeps ${S} afloat.`,
      `Every other move lets ${O} cash in; spotting that the quiet-looking alternatives fail is the whole puzzle.`,
    ], seed >>> 7));
  }
  return sentences.join(' ').replace(/\s+/g, ' ').trim();
}

// What `color` would do if it could move twice: a search (G0) of the position with `color`
// to move. Returns { san, text } when that wins a piece or mates, else null.
const threatSearcher = new SK.Searcher();
function threatOf(pos, color) {
  if (pos.inCheck(color ^ 1)) return null;
  const parts = pos.fen().split(' ');
  parts[1] = color === WHITE ? 'w' : 'b';
  let q;
  try { q = new Position(parts.join(' ')); } catch { return null; }
  if (!q.hasLegalMove()) return null;
  threatSearcher.clear();
  const r = threatSearcher.think(q, { nodes: 150000, depth: 8 });
  if (!r.best) return null;
  const m = r.best;
  const moveSan = san(q, m);
  if (r.score >= MATE - 1000) {
    const n = Math.ceil((MATE - r.score) / 2);
    return { san: moveSan, text: n <= 1 ? `${moveSan}, which would be mate` : `${moveSan}, starting a mating attack` };
  }
  const c = q.board[moveTo(m)];
  if (c && !moveDrop(m) && VAL[typeOf(c)] >= 3 && r.score >= 250) {
    return { san: moveSan, text: `${moveSan}, winning the ${NAME[typeOf(c)]} on ${sqName(moveTo(m))}` };
  }
  if (r.score >= 400 && r.pv.length) return { san: moveSan, text: `${moveSan}, with a winning attack` };
  return null;
}

// Enemy pieces (not pawns or the king) the solver attacks after the key move but not before.
function newlyAttacked(a) {
  const p1 = afterN(a, 1);
  const out = [];
  for (let sq = 0; sq < 36; sq++) {
    const c = a.pos.board[sq];
    if (!c || colorOf(c) !== a.opp || typeOf(c) === KING || typeOf(c) === PAWN) continue;
    if (p1.board[sq] !== c) continue;
    if (!a.pos.isAttacked(sq, a.solver) && p1.isAttacked(sq, a.solver)) out.push(sq);
  }
  return out;
}

// Squares next to the enemy king that the key move newly covers.
function kingSquaresTaken(a) {
  const p1 = afterN(a, 1);
  const k = p1.kingSq[a.opp];
  return KING_S[k].filter(sq => !a.pos.board[sq] && !a.pos.isAttacked(sq, a.solver) && p1.isAttacked(sq, a.solver));
}

// What happens after a forking check: the capture that collects the other target, if the line has it.
function forkFollow(a) {
  if (a.raw.line.length >= 3) {
    const p = afterN(a, 2);
    const m = p.moveFromUci(a.raw.line[2]);
    const c = p.board[moveTo(m)];
    if (c && !moveDrop(m)) return `then ${san(p, m)} picks up the ${NAME[typeOf(c)]}`;
  }
  return isMate(a.best) ? 'the attack on the king rolls on' : 'the other piece falls';
}

// For each solver move of the line, whether it gives check.
function solverChecks(a) {
  const p = new Position(a.raw.fen);
  const out = [];
  a.raw.line.forEach((u, i) => {
    p.makeMove(p.moveFromUci(u));
    if (i % 2 === 0) out.push(p.inCheck());
  });
  return out;
}

function afterN(a, n) {
  const p = new Position(a.raw.fen);
  for (let i = 0; i < n; i++) p.makeMove(p.moveFromUci(a.raw.line[i]));
  return p;
}

function titleOf(a, th, group) {
  const pos = new Position(a.raw.fen);
  const keySan = san(pos, a.key).replace(/[+#]$/, '');
  const mn = NAME[a.moverType];
  let t;
  if (th.includes('mate')) t = a.solverMoves === 1 ? `${cap(mn)}${a.drop ? ' drop' : ''} mates on ${sqName(a.to)}` : `Mate in ${a.solverMoves}${a.drop ? ' from the reserve' : a.sacrifice ? ' with a sacrifice' : ''}`;
  else if (th.includes('stalemate')) t = a.solverMoves === 1 ? `No moves left after ${keySan}` : `Squeeze in ${a.solverMoves}`;
  else if (th.includes('defence')) t = `Only move: ${keySan}`;
  else if (th.includes('dropFork')) t = `${cap(mn)} drop fork on ${sqName(a.to)}`;
  else if (th.includes('fork')) t = `${cap(mn)} fork on ${sqName(a.to)}`;
  else if (th.includes('discovered')) t = `Discovered check with ${keySan}`;
  else if (th.includes('sacrifice')) t = `${cap(mn)} sacrifice on ${sqName(a.to)}`;
  else if (th.includes('hanging') && a.capturedUndefended) t = `Loose ${NAME[a.captured]} on ${sqName(a.to)}`;
  else if (th.includes('drop')) t = `${cap(mn)} drop on ${sqName(a.to)}`;
  else if (th.includes('quiet')) t = `Quiet ${mn} move ${keySan}`;
  else t = `${cap(mn)} strikes on ${sqName(a.to)}`;
  return t.slice(0, 40);
}

function goalOf(a, th) {
  const S = colorName(a.solver), O = colorName(a.opp);
  if (th.includes('mate')) return `${S} to move and mate in ${a.solverMoves}`;
  if (th.includes('stalemate')) return `${S} to move and leave ${O} without a legal move`;
  if (th.includes('defence')) return `${S} to move: find the only move that holds`;
  const won = a.gained.map(g => g.t).sort((x, y) => VAL[y] - VAL[x]);
  if (a.matDelta >= 5.5 && won[0] === ROOK) return `${S} to move and win the rook`;
  if (a.matDelta >= 3.5 && (won[0] === KNIGHT || won[0] === BISHOP)) return `${S} to move and win the ${NAME[won[0]]}`;
  return `${S} to move and win`;
}

function resultOf(a, th) {
  if (th.includes('mate')) return `Mate in ${a.solverMoves}`;
  if (th.includes('stalemate')) return `${colorName(a.opp)} has no legal move: ${colorName(a.solver)} wins`;
  const S = colorName(a.solver);
  const ev = `${pawns(a.best)} for ${S}`;
  if (th.includes('defence')) return a.best >= 100 ? `Keeps the edge (${ev})` : a.best <= -100 ? `Stays in the game (${ev})` : `Holds the balance (${ev})`;
  if (isMate(a.best)) return 'A forced win';
  const won = a.gained.map(g => g.t).sort((x, y) => VAL[y] - VAL[x]);
  const net = a.matDelta - a.recapture;
  if (won.length && net >= 2.5 && won[0] !== PAWN) return `Wins ${article(NAME[won[0]])} (${ev})`;
  return `Wins material (${ev})`;
}

// --- main ------------------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const out = args.pop();
  const raws = [];
  for (const f of args) for (const line of fs.readFileSync(f, 'utf8').split('\n')) if (line.trim()) raws.push(JSON.parse(line));
  const seen = new Set();
  const items = [];
  let rejected = { dup: 0, trivial: 0, error: 0, short: 0 };
  for (const raw of raws) {
    const key = raw.fen.split(' ').slice(0, 2).join(' ');
    if (seen.has(key)) { rejected.dup++; continue; }
    // Classify again from the deep search.
    const t0 = raw.steps[0].top.map(([u, sc]) => parseScore(sc));
    const b = t0[0], sc = t0.length > 1 ? t0[1] : -MATE;
    if ((b >= 250 && sc <= b - 250 && (sc <= 150 || (isMate(b) && sc < 700))) || (isMate(b) && !isMate(sc) && sc < 700)) raw.kind = 'attack';
    else if (b > -120 && b < 250 && sc <= b - 300) raw.kind = 'defence';
    else { rejected.trivial++; continue; }
    if (raw.kind === 'defence') raw.line = raw.line.slice(0, 1), raw.steps = raw.steps.slice(0, 1);
    let a;
    try { a = analyse(raw); } catch (e) { rejected.error++; continue; }
    const th = themesOf(a);
    // Drop defence puzzles where the side in check has only one or two moves anyway.
    if (th.includes('defence') && a.pos.legalMoves().length <= 2) { rejected.trivial++; continue; }
    // A mating attack whose line was cut off before the mate is not a clean puzzle.
    if (isMate(a.best) && !a.finalTerminal && MATE - a.best <= 7) { rejected.short++; continue; }
    seen.add(key);
    items.push({ a, th, d: rawDifficulty(a, th) });
  }
  // Keep the easy, repetitive kinds from crowding out the rest.
  const caps = { 'Only moves': 0.14, 'Loose pieces': 0.14, 'Mate in 1': 0.16 };
  for (const [g, frac] of Object.entries(caps)) {
    const max = Math.round(frac * items.length);
    const inGroup = items.filter(it => groupOf(it.a, it.th) === g);
    if (inGroup.length <= max) continue;
    // Drop plain captures first, then the easiest.
    inGroup.sort((x, y) => (x.a.captured ? 0 : 1) - (y.a.captured ? 0 : 1) || x.d - y.d);
    const drop = new Set(inGroup.slice(0, inGroup.length - max));
    for (let i = items.length - 1; i >= 0; i--) if (drop.has(items[i])) items.splice(i, 1);
    rejected.capped = (rejected.capped || 0) + drop.size;
  }
  // Ratings by rank, mapped piecewise so every level gets a fair share.
  const order = items.slice().sort((x, y) => x.d - y.d);
  const knots = [[0, 600], [0.2, 1000], [0.42, 1300], [0.64, 1600], [0.84, 1900], [1, 2600]];
  order.forEach((it, i) => {
    const q = order.length > 1 ? i / (order.length - 1) : 0;
    let k = 1;
    while (k < knots.length - 1 && q > knots[k][0]) k++;
    const [q0, r0] = knots[k - 1], [q1, r1] = knots[k];
    it.rating = Math.round((r0 + ((q - q0) / (q1 - q0)) * (r1 - r0)) / 10) * 10;
    if (it.rating >= 2600) it.rating = 2590;
  });
  // Stable ids in order of difficulty.
  order.forEach((it, i) => (it.id = `m${String(i + 1).padStart(4, '0')}`));
  const puzzles = order.map(it => {
    const { a, th } = it;
    const group = groupOf(a, th);
    const alts = [];
    a.raw.steps.forEach((st, k) => {
      const top = st.top.map(([u, s]) => ({ u, s: parseScore(s) }));
      alts.push(isMate(top[0].s) ? top.slice(1).filter(t => t.s === top[0].s).map(t => t.u) : []);
    });
    const obj = {
      id: it.id,
      fen: a.raw.fen,
      line: a.raw.line,
      rating: it.rating,
      level: levelOf(it.rating),
      themes: th,
      group,
      title: titleOf(a, th, group),
      goal: goalOf(a, th),
      explain: explain(a, th, it.id),
      result: resultOf(a, th),
      source: 'selfplay-g25',
    };
    if (alts.some(x => x.length)) obj.alts = alts;
    return obj;
  });
  const body = puzzles.map(p => `    ${JSON.stringify(p)},`).join('\n');
  const js = `'use strict';
// Middlegame tactics for the Train section: positions from G25 self-play, verified with
// Stockhorse (G25), built by crates/puzzlegen and tools/train/build-tactics.js.
(function (root) {
  const DATA = [
${body}
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = DATA;
  else (root.TrainData = root.TrainData || {}).tactics = DATA;
})(typeof self !== 'undefined' ? self : this);
`;
  fs.writeFileSync(out, js);
  const byLevel = {}, byGroup = {};
  for (const p of puzzles) {
    byLevel[p.level] = (byLevel[p.level] || 0) + 1;
    byGroup[p.group] = (byGroup[p.group] || 0) + 1;
  }
  console.log(`${puzzles.length} puzzles from ${raws.length} candidates`, rejected);
  console.log('levels', byLevel);
  console.log('groups', byGroup);
}

if (require.main === module) main();
module.exports = { san, lineText };
