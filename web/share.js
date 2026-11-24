'use strict';
// Sharing and importing games and positions: links that open straight onto the analysis board
// or the review, a plain-text game file, and one reader that takes any of those (or a FEN, or a
// move list) and says what it holds. No DOM here, so node web/test.js can check it.
//
// Links put everything after the hash, so they work on any static host:
//   #/analysis?fen=<fen>&moves=b2b3.c5c4.R@c4&at=2
//   #/review?moves=…&w=White+name&b=Black+name&r=w&why=checkmate[&fen=…][&at=…]
// The FEN is left out for the usual starting position; spaces in it are written as `_`.
//
// A game file is a few tag lines and the moves, numbered:
//   [Game "Maki"]
//   [White "You"]
//   [Black "Stockhorse 1200"]
//   [Result "1-0"]
//   [Termination "checkmate"]
//   [FEN "…"]            (only when the game did not start from the usual position)
//
//   1. b2b3 c5c4 2. R@c4 …  1-0

(function (root) {
  const SK = root.StockKnight || (typeof require === 'function' ? require('../reference/engine.js') : null);
  const MAX_MOVES = 1000;

  // --- links -------------------------------------------------------------------------------

  // Keeps the characters a URL fragment allows as they are, so links stay readable.
  const enc = s => encodeURIComponent(s).replace(/%2F/g, '/').replace(/%40/g, '@').replace(/%3A/g, ':');
  const fenOut = fen => enc(fen.trim().replace(/\s+/g, '_'));
  const fenIn = s => s.replace(/_/g, ' ').trim();

  // The hash for a shared position or game.
  //   kind 'analysis': { fen, moves, at }
  //   kind 'review':   { fen, moves, at, white, black, result: { winner: 'w'|'b'|null, reason } }
  function linkHash(kind, d) {
    const parts = [];
    if (d.fen && d.fen !== SK.START_FEN) parts.push(`fen=${fenOut(d.fen)}`);
    const moves = d.moves || [];
    if (moves.length) parts.push(`moves=${moves.map(enc).join('.')}`);
    if (d.at !== undefined && d.at !== null && d.at !== moves.length) parts.push(`at=${d.at | 0}`);
    if (kind === 'review') {
      if (d.white && d.white !== 'White') parts.push(`w=${enc(d.white)}`);
      if (d.black && d.black !== 'Black') parts.push(`b=${enc(d.black)}`);
      if (d.result) {
        parts.push(`r=${d.result.winner || 'd'}`);
        if (d.result.reason) parts.push(`why=${enc(d.result.reason)}`);
      }
    }
    // Always a query, even for the bare starting position, so the link is read as a share.
    return `#/${kind}?${parts.length ? parts.join('&') : 'start'}`;
  }

  // The page's address without its hash or query, for building links.
  function baseUrl(href) {
    return String(href).replace(/[?#].*$/, '');
  }

  function shareUrl(href, kind, d) {
    return baseUrl(href) + linkHash(kind, d);
  }

  // What a hash holds: { kind: 'analysis'|'review', fen, moves, at, white, black, result },
  // { kind: 'online', id }, { kind: 'route', hash } for the site's other pages, or null.
  function parseHash(hash) {
    const h = String(hash || '').trim();
    const online = /^#\/online\/([a-z0-9]{4,12})$/.exec(h);
    if (online) return { kind: 'online', id: online[1] };
    const m = /^#\/(analysis|review)\?(.*)$/.exec(h);
    if (!m) {
      if (/^#\/(learn|train|rules|analysis|review|play)?(\/[a-z0-9/-]*)?$/.test(h)) return { kind: 'route', hash: h };
      return null;
    }
    const q = {};
    for (const pair of m[2].split('&')) {
      const i = pair.indexOf('=');
      if (i < 0) continue;
      let v = pair.slice(i + 1).replace(/\+/g, ' ');
      try {
        v = decodeURIComponent(v);
      } catch {
        /* keep it as it came */
      }
      q[pair.slice(0, i)] = v;
    }
    const out = {
      kind: m[1],
      fen: q.fen ? fenIn(q.fen) : SK.START_FEN,
      moves: q.moves ? q.moves.split(/[.\s,]+/).filter(Boolean) : [],
    };
    if (q.at !== undefined && /^\d+$/.test(q.at)) out.at = +q.at;
    if (q.w) out.white = q.w;
    if (q.b) out.black = q.b;
    if (q.r && /^[wbd]$/.test(q.r)) out.result = { winner: q.r === 'd' ? null : q.r, reason: q.why || (q.r === 'd' ? 'agreement' : 'resignation') };
    return out;
  }

  // --- game files --------------------------------------------------------------------------

  const RESULT_TOKEN = { w: '1-0', b: '0-1', d: '1/2-1/2' };

  const tag = (k, v) => `[${k} "${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

  // A game as a text file. `game`: { fen/startFen, moves, white, black, result, date, link }.
  function gameText(game) {
    const fen = game.fen || game.startFen || SK.START_FEN;
    const moves = game.moves || [];
    const r = game.result;
    const token = r ? RESULT_TOKEN[r.winner || 'd'] : '*';
    const lines = [tag('Game', 'Maki'), tag('Ruleset', SK.RULESET || 'knightchess-2')];
    if (game.date) lines.push(tag('Date', new Date(game.date).toISOString().slice(0, 10).replace(/-/g, '.')));
    lines.push(tag('White', game.white || 'White'), tag('Black', game.black || 'Black'), tag('Result', token));
    if (r && r.reason) lines.push(tag('Termination', r.reason));
    if (fen !== SK.START_FEN) lines.push(tag('FEN', fen));
    if (game.link) lines.push(tag('Link', game.link));

    // Number the moves from the side to move in the start position.
    const pos = new SK.Position(fen);
    let n = pos.moveNo || 1;
    let black = pos.side === SK.BLACK;
    const words = [];
    moves.forEach((u, i) => {
      if (!black) words.push(`${n}.`);
      else if (i === 0) words.push(`${n}...`);
      words.push(u);
      if (black) n++;
      black = !black;
    });
    words.push(token);
    // Wrap the move text near 80 columns.
    const out = [];
    let line = '';
    for (const w of words) {
      if (line && line.length + 1 + w.length > 80) {
        out.push(line);
        line = w;
      } else line = line ? `${line} ${w}` : w;
    }
    if (line) out.push(line);
    return `${lines.join('\n')}\n\n${out.join('\n')}\n`;
  }

  // A file name for a game: maki-<white>-vs-<black>-<date>.txt
  function fileName(game) {
    const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    const parts = ['maki'];
    if (game.white || game.black) parts.push(slug(game.white || 'white'), 'vs', slug(game.black || 'black'));
    if (game.date) parts.push(new Date(game.date).toISOString().slice(0, 10));
    return `${parts.filter(Boolean).join('-')}.txt`;
  }

  const TAG_LINE = /^\s*\[(\w+)\s+"((?:[^"\\]|\\.)*)"\s*\]\s*$/gm;

  function parseTags(text) {
    const tags = {};
    const re = new RegExp(TAG_LINE.source, 'gm');
    let m;
    while ((m = re.exec(text))) tags[m[1]] = m[2].replace(/\\(.)/g, '$1');
    return tags;
  }

  // --- reading anything --------------------------------------------------------------------

  const looksLikeFen = s => /^[1-6pnbrqkPNBRQK/]+\[[^\]]*\]\s+[wb]\b/.test(s);
  const RESULT_WORDS = /^(1-0|0-1|1\/2-1\/2|½-½|\*)$/;
  const isMoveNumber = w => /^\d+\.+$/.test(w);
  const isUci = w => /^([a-f][1-6][a-f][1-6]|[PNBRQ]@[a-f][1-6])$/.test(w);

  // Plays `moves` from `fen`; { fen, moves, pos } or { error }.
  function replay(fen, moves) {
    let pos;
    try {
      pos = new SK.Position(fen);
    } catch (e) {
      return { error: `That position does not read right: ${String(e.message).replace(/^bad FEN:?\s*/, '').replace(/: [^:]*$/, '')}.` };
    }
    const normal = pos.fen();
    if (moves.length > MAX_MOVES) return { error: `That game is too long (${moves.length} moves).` };
    for (let i = 0; i < moves.length; i++) {
      const m = pos.moveFromUci(moves[i]);
      if (!m) return { error: `Move ${i + 1}, ${moves[i]}, is not legal there.` };
      pos.makeMove(m);
    }
    return { fen: normal, moves, pos };
  }

  // What a pasted text, dropped file or shared link holds. Returns one of
  //   { kind: 'analysis' | 'review', fen, moves, at?, white?, black?, result?, from }
  //   { kind: 'online', id } or { kind: 'route', hash }
  //   { error } when it looked like something to import but would not read,
  //   null when it does not look like anything to import.
  // `from` says what it was: 'link', 'file', 'fen' or 'moves'. Game files and review links come
  // back as 'review'; positions, analysis links and bare move lists as 'analysis'.
  function read(input) {
    const text = String(input || '').replace(/^﻿/, '').trim();
    if (!text || text.length > 200000) return null;

    // A link: anything with one of the site's hashes in it.
    const url = /(?:^|\s)(\S*#\/(?:analysis|review|online|learn|train|rules|play)\S*)/.exec(text);
    if (url) {
      const h = parseHash(url[1].slice(url[1].indexOf('#/')));
      if (!h) return { error: 'That link does not point to a Maki game or position.' };
      if (h.kind !== 'analysis' && h.kind !== 'review') return h;
      const r = replay(h.fen, h.moves);
      if (r.error) return { error: r.error };
      const out = { ...h, fen: r.fen, from: 'link' };
      if (out.at !== undefined) out.at = Math.min(out.at, h.moves.length);
      return out;
    }

    // A game file.
    const tags = parseTags(text);
    if (Object.keys(tags).length) {
      const body = text.replace(new RegExp(TAG_LINE.source, 'gm'), '').replace(/\{[^}]*\}/g, ' ').replace(/;[^\n]*/g, ' ');
      const words = body.split(/\s+/).filter(Boolean).map(w => w.replace(/^\d+\.+/, '')).filter(w => w && !isMoveNumber(w));
      const moves = words.filter(w => !RESULT_WORDS.test(w));
      const bad = moves.find(w => !isUci(w));
      if (bad) return { error: `The game's moves should be in UCI form, like b2b3 or R@c4; "${bad}" is not.` };
      const r = replay(tags.FEN || SK.START_FEN, moves);
      if (r.error) return { error: r.error };
      const out = { kind: 'review', fen: r.fen, moves, from: 'file' };
      if (tags.White) out.white = tags.White;
      if (tags.Black) out.black = tags.Black;
      const winner = { '1-0': 'w', '0-1': 'b', '1/2-1/2': null, '½-½': null }[tags.Result];
      if (winner !== undefined) out.result = { winner, reason: tags.Termination || (winner ? 'resignation' : 'agreement') };
      else {
        const st = r.pos.status();
        if (st.state !== 'ongoing') out.result = { winner: st.state === 'win' ? (st.winner === SK.WHITE ? 'w' : 'b') : null, reason: st.reason };
      }
      if (tags.Date) {
        const d = Date.parse(tags.Date.replace(/\./g, '-'));
        if (!Number.isNaN(d)) out.date = d;
      }
      return out;
    }

    // "<fen>" or "<fen> moves <uci …>", as the analysis board's Copy buttons write them.
    const fm = /^(.*?)(?:\s+moves\s+([\s\S]*))?$/.exec(text.replace(/\s+/g, ' '));
    if (looksLikeFen(fm[1])) {
      const moves = (fm[2] || '').split(/\s+/).filter(w => w && !isMoveNumber(w) && !RESULT_WORDS.test(w));
      const r = replay(fm[1].trim(), moves);
      if (r.error) return { error: r.error };
      return { kind: 'analysis', fen: r.fen, moves, from: 'fen' };
    }

    // A bare move list from the starting position: "b2b3 c5c4 R@c4", numbers allowed.
    const words = text.split(/[\s,]+/).filter(Boolean).map(w => w.replace(/^\d+\.+/, '')).filter(w => w && !isMoveNumber(w));
    const moves = words.filter(w => !RESULT_WORDS.test(w));
    if (moves.length && moves.every(isUci)) {
      const r = replay(SK.START_FEN, moves);
      if (r.error) return { error: r.error };
      return { kind: 'analysis', fen: r.fen, moves, from: 'moves' };
    }
    return null;
  }

  const api = { linkHash, shareUrl, baseUrl, parseHash, gameText, fileName, read, MAX_MOVES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Share = api;
})(typeof self !== 'undefined' ? self : globalThis);
