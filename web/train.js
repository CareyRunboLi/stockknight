'use strict';
// The Train section: opening lines to learn and practise, middlegame tactics and endgame
// positions to solve. The data lives in web/train/*.js (window.TrainData); see docs/TRAIN.md.
// app.js calls Train.init(ui) with the shared pieces of the site (board view, storage, toasts).

(function () {
  const SK = window.StockKnight;
  const { Position, START_FEN, WHITE, BLACK, moveFrom, moveTo, moveDrop } = SK;
  const LETTERS = '.PNBRQK';
  const DROP_ORDER = [SK.PAWN, SK.BISHOP, SK.ROOK];
  const LEVELS = [
    null,
    { name: 'Beginner', hint: 'under 1000' },
    { name: 'Casual', hint: '1000–1300' },
    { name: 'Club', hint: '1300–1600' },
    { name: 'Expert', hint: '1600–1900' },
    { name: 'Master', hint: '1900 and up' },
  ];
  const STAGES = {
    middlegame: {
      key: 'tactics',
      title: 'Middlegame tactics',
      blurb: 'Forks, drops, pins, sacrifices and mating attacks from real Stockhorse games. Find the move that wins.',
      piece: 'N',
    },
    endgame: {
      key: 'endgames',
      title: 'Endgames',
      blurb: 'Exact positions from the endgame tablebases: convert a win, hold a draw, and learn why stalemate wins in Maki.',
      piece: 'K',
    },
  };
  const PAGE = 60;

  let ui = null; // shared helpers from app.js
  let $, $$, esc, pieceSvg, store, toast;
  const colorKey = c => (c === WHITE ? 'w' : 'b');
  const colorName = c => (c === WHITE ? 'White' : 'Black');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const data = () => window.TrainData || {};
  const puzzles = stage => data()[STAGES[stage].key] || [];
  const openings = () => data().openings || [];

  // --- progress (kept in the browser) -----------------------------------------------------

  const progress = {
    load() {
      const p = store.get('sk.train', null) || {};
      p.done = p.done || {}; // puzzle id -> 'clean' (solved first try) | 'solved' (with help) | 'failed'
      p.rating = p.rating || { middlegame: 1000, endgame: 1000 };
      p.played = p.played || { middlegame: 0, endgame: 0 };
      p.openings = p.openings || {}; // opening id -> { runs, clean }
      return p;
    },
    get() {
      return this.p || (this.p = this.load());
    },
    save() {
      store.set('sk.train', this.p);
    },
  };

  // A first attempt moves the stage rating like an Elo game against the puzzle's rating.
  function rate(stage, puzzle, clean) {
    const p = progress.get();
    if (p.done[puzzle.id]) return 0;
    const r = p.rating[stage];
    const expected = 1 / (1 + Math.pow(10, (puzzle.rating - r) / 400));
    const k = p.played[stage] < 20 ? 40 : 24;
    const delta = Math.round(k * ((clean ? 1 : 0) - expected));
    p.rating[stage] = Math.max(400, r + delta);
    p.played[stage]++;
    return delta;
  }

  function moveName(pos, uci) {
    const m = pos.moveFromUci(uci);
    return m ? pos.moveToText(m) : uci;
  }

  function numberedLine(fen, moves) {
    const pos = new Position(fen);
    const out = [];
    moves.forEach((u, i) => {
      const prefix = pos.side === WHITE ? `${pos.moveNo}. ` : i === 0 ? `${pos.moveNo}… ` : '';
      const m = pos.moveFromUci(u);
      if (!m) return;
      out.push(prefix + pos.moveToText(m));
      pos.makeMove(m);
    });
    return out.join(' ');
  }

  function levelDots(level) {
    let s = '';
    for (let i = 1; i <= 5; i++) s += `<i class="${i <= level ? 'on' : ''}"></i>`;
    return `<span class="lvl-dots" title="${LEVELS[level].name}">${s}</span>`;
  }

  // Player bars with reserves; a reserve piece is a button while it can be dropped.
  function barsHtml(board, pos, color, label, canDrop, dropSel) {
    const st = pos.status();
    const droppable = new Set(canDrop && st.state === 'ongoing' ? board.legal.map(moveDrop).filter(Boolean) : []);
    const mine = canDrop && pos.side === color && st.state === 'ongoing';
    const res = DROP_ORDER.map(t => {
      const n = pos.hand[color][t];
      const usable = mine && droppable.has(t);
      const name = window.Pieces.NAMES[LETTERS[t]];
      const cls = ['res', n ? '' : 'empty', usable ? 'usable' : '', usable && dropSel === t ? 'sel' : ''].join(' ');
      return `<button class="${cls}" data-type="${t}" title="${n} ${name}${n === 1 ? '' : 's'} in reserve"${usable ? '' : ' tabindex="-1"'}>
        ${pieceSvg(LETTERS[t], colorKey(color))}${n > 1 ? `<span class="count">${n}</span>` : ''}</button>`;
    }).join('');
    return `<div class="avatar">${pieceSvg('K', colorKey(color))}</div>
      <div><div class="pname">${esc(label)}</div><div class="psub">${pos.side === color && st.state === 'ongoing' ? 'To move' : label === colorName(color) ? '' : colorName(color)}</div></div>
      <div class="reserve">${res}</div>`;
  }

  // --- the section's skeleton -------------------------------------------------------------

  function skeleton() {
    return `
      <div class="train-page" id="trHub"></div>
      <div class="train-page" id="trList" hidden></div>
      <div class="train-page" id="trOpenings" hidden></div>
      <div class="arena train-arena" id="trArena" hidden>
        <div class="board-col">
          <div class="player-bar" id="trBarTop"></div>
          <div class="board-wrap"><div class="board" id="trBoard"></div></div>
          <div class="player-bar" id="trBarBottom"></div>
          <div class="navrow" id="trNav" hidden>
            <button class="btn" data-trstep="start" title="Start (Home)">⏮</button>
            <button class="btn" data-trstep="prev" title="Back (←)">◀</button>
            <button class="btn" data-trstep="next" title="Forward (→)">▶</button>
            <button class="btn" data-trstep="end" title="End (End)">⏭</button>
            <button class="btn" id="trFlip" title="Flip board (F)">⇅</button>
          </div>
        </div>
        <aside class="panel train-panel" id="trPanel"></aside>
      </div>`;
  }

  function showPage(id) {
    for (const p of ['trHub', 'trList', 'trOpenings', 'trArena']) $(`#${p}`).hidden = p !== id;
  }

  // --- hub --------------------------------------------------------------------------------

  function renderHub() {
    const p = progress.get();
    const ops = openings();
    const card = (href, piece, title, blurb, stats) => `
      <a class="train-card" href="${href}">
        <span class="mode-icon">${pieceSvg(piece, 'w')}</span>
        <span class="mode-title">${title}</span>
        <span class="mode-sub">${blurb}</span>
        <span class="train-stats">${stats}</span>
      </a>`;
    const stageStats = stage => {
      const list = puzzles(stage);
      const solved = list.filter(x => p.done[x.id] === 'clean' || p.done[x.id] === 'solved').length;
      return `<b>${list.length}</b> positions · ${solved} solved · rating <b>${p.rating[stage]}</b>`;
    };
    const practised = ops.filter(o => p.openings[o.id] && p.openings[o.id].clean).length;
    $('#trHub').innerHTML = `
      <div class="train-head">
        <p class="eyebrow">Train</p>
        <h1>Three stages of the game</h1>
        <p class="lede">Learn the openings by name and play their main lines, then sharpen your middlegame tactics and endgame technique on positions checked by Stockhorse and the endgame tablebases.</p>
      </div>
      <div class="train-stages">
        ${card('#/train/openings', 'P', '1 · Openings', 'Named openings with their main lines, side variations and the plans behind them. Read them, then play them from memory.', `<b>${ops.length}</b> openings · ${practised} mastered`)}
        ${card('#/train/middlegame', STAGES.middlegame.piece, '2 · Middlegame tactics', STAGES.middlegame.blurb, stageStats('middlegame'))}
        ${card('#/train/endgame', STAGES.endgame.piece, '3 · Endgames', STAGES.endgame.blurb, stageStats('endgame'))}
      </div>
      <div class="train-howto">
        <h2>How it works</h2>
        <ul>
          <li>Every puzzle is a position with one clear winning idea. Play the moves for the side to move; Stockhorse answers with the best defence.</li>
          <li>A wrong move is taken back and you can try again, ask for a hint, or see the solution. Each position comes with an explanation of the idea.</li>
          <li>Difficulty runs from <b>Beginner</b> to <b>Master</b>. Your training rating for each stage goes up or down with your first try at each puzzle.</li>
          <li>Progress is saved in this browser.</li>
        </ul>
      </div>`;
  }

  // --- puzzle lists -----------------------------------------------------------------------

  const listState = { stage: 'middlegame', level: 0, group: '', status: '', shown: PAGE };

  function filtered(stage, f = listState) {
    const p = progress.get();
    return puzzles(stage).filter(x => {
      if (f.level && x.level !== f.level) return false;
      if (f.group && x.group !== f.group) return false;
      const d = p.done[x.id];
      if (f.status === 'unsolved' && (d === 'clean' || d === 'solved')) return false;
      if (f.status === 'solved' && !(d === 'clean' || d === 'solved')) return false;
      if (f.status === 'failed' && d !== 'failed') return false;
      return true;
    });
  }

  function renderList(stage) {
    if (listState.stage !== stage) Object.assign(listState, { stage, level: 0, group: '', status: '', shown: PAGE });
    const all = puzzles(stage);
    const p = progress.get();
    const groups = [...new Set(all.map(x => x.group))].sort();
    const items = filtered(stage).sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
    const byLevel = [0, 1, 2, 3, 4, 5].map(l => (l ? all.filter(x => x.level === l).length : all.length));
    const solved = all.filter(x => p.done[x.id] === 'clean' || p.done[x.id] === 'solved').length;
    const S = STAGES[stage];
    const statusIcon = id => {
      const d = p.done[id];
      if (d === 'clean') return '<span class="pz-st ok" title="Solved first try">✓</span>';
      if (d === 'solved') return '<span class="pz-st help" title="Solved with help">✓</span>';
      if (d === 'failed') return '<span class="pz-st bad" title="Missed">✗</span>';
      return '<span class="pz-st"></span>';
    };
    $('#trList').innerHTML = `
      <div class="train-crumbs"><a href="#/train">Train</a> › ${S.title}</div>
      <div class="train-listhead">
        <div>
          <h1>${S.title}</h1>
          <p class="muted">${S.blurb}</p>
        </div>
        <div class="train-rating"><span>Your rating</span><b>${p.rating[stage]}</b><small>${solved} of ${all.length} solved</small></div>
      </div>
      <div class="train-filters">
        <div class="chips" id="trLevels">
          ${byLevel.map((n, l) => `<button class="chip ${listState.level === l ? 'on' : ''}" data-level="${l}">${l ? LEVELS[l].name : 'All levels'} <small>${n}</small></button>`).join('')}
        </div>
        <div class="controls">
          <select class="btn" id="trGroup" aria-label="Theme">
            <option value="">All themes</option>
            ${groups.map(g => `<option ${g === listState.group ? 'selected' : ''}>${esc(g)}</option>`).join('')}
          </select>
          <select class="btn" id="trStatus" aria-label="Status">
            ${[['', 'Any status'], ['unsolved', 'Not solved yet'], ['solved', 'Solved'], ['failed', 'Missed']].map(([v, t]) => `<option value="${v}" ${v === listState.status ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
          <button class="btn primary" id="trStart" ${items.length ? '' : 'disabled'}>Start training${items.length ? ` (${items.length})` : ''}</button>
        </div>
      </div>
      ${items.length ? '' : '<p class="muted">No positions match these filters.</p>'}
      <ul class="pz-grid">
        ${items.slice(0, listState.shown).map(x => `
          <li><a class="pz-tile" href="#/train/p/${esc(x.id)}">
            ${statusIcon(x.id)}
            <span class="pz-title">${p.done[x.id] === 'clean' || p.done[x.id] === 'solved' || p.done[x.id] === 'failed' ? esc(x.title) : `Puzzle ${esc(x.id.slice(1).replace(/^0+/, ''))}`}</span>
            <span class="pz-meta">${levelDots(x.level)} <span>${esc(x.group)}</span></span>
            <span class="pz-goal">${esc(x.goal)}</span>
          </a></li>`).join('')}
      </ul>
      ${items.length > listState.shown ? `<div class="controls center"><button class="btn" id="trMore">Show more (${items.length - listState.shown} left)</button></div>` : ''}`;
    $('#trLevels').onclick = e => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      listState.level = +b.dataset.level;
      listState.shown = PAGE;
      renderList(stage);
    };
    $('#trGroup').onchange = () => {
      listState.group = $('#trGroup').value;
      listState.shown = PAGE;
      renderList(stage);
    };
    $('#trStatus').onchange = () => {
      listState.status = $('#trStatus').value;
      listState.shown = PAGE;
      renderList(stage);
    };
    $('#trStart').onclick = () => {
      const next = pickNext(stage, null);
      if (next) location.hash = `#/train/p/${next.id}`;
    };
    if ($('#trMore')) {
      $('#trMore').onclick = () => {
        listState.shown += PAGE;
        renderList(stage);
      };
    }
  }

  // The next puzzle in the current filter: unsolved first, nearest the player's rating.
  function pickNext(stage, after) {
    const p = progress.get();
    const f = listState.stage === stage ? listState : { level: 0, group: '', status: '' };
    let pool = filtered(stage, { ...f, status: f.status || '' }).filter(x => !after || x.id !== after.id);
    const fresh = pool.filter(x => !p.done[x.id]);
    if (fresh.length) pool = fresh;
    if (!pool.length) return null;
    const r = p.rating[stage];
    const scored = pool.map(x => ({ x, d: Math.abs(x.rating - r) + Math.random() * 250 }));
    scored.sort((a, b) => a.d - b.d);
    return scored[0].x;
  }

  // --- solving a puzzle -------------------------------------------------------------------

  const solver = {
    board: null,
    p: null,
    stage: null,
    pos: null,
    step: 0, // index into p.line of the solver's next move
    color: WHITE,
    flipped: false,
    state: 'play', // play | wait | done
    helped: false, // a hint, the solution or a wrong move: not a clean solve
    wrong: 0,
    hint: 0,
    feedback: null, // { cls, text }
    delta: null,
    dropSel: null,
    run: 0,

    open(id) {
      const found = findPuzzle(id);
      if (!found) {
        toast('That position is not in this version of the trainer');
        location.hash = '#/train';
        return;
      }
      this.p = found.p;
      this.stage = found.stage;
      this.run++;
      this.pos = new Position(this.p.fen);
      this.color = this.pos.side;
      this.flipped = this.color === BLACK;
      this.step = 0;
      this.state = 'play';
      this.helped = false;
      this.wrong = 0;
      this.hint = 0;
      this.delta = null;
      this.feedback = null;
      this.lastMove = 0;
      this.dropSel = null;
      showPage('trArena');
      $('#trNav').hidden = true;
      this.render();
    },

    solverStepIndex() {
      return this.step >> 1;
    },

    accepted(uci) {
      const p = this.p;
      if (uci === p.line[this.step]) return 'main';
      const alts = (p.alts && p.alts[this.solverStepIndex()]) || [];
      if (alts.includes(uci)) return 'alt';
      // A move that leaves the opponent with no legal move wins on the spot in Maki.
      const m = this.pos.moveFromUci(uci);
      if (m) {
        this.pos.makeMove(m);
        const over = !this.pos.hasLegalMove();
        this.pos.unmakeMove();
        if (over) return 'alt';
      }
      return null;
    },

    async onMove(uci) {
      if (this.state !== 'play') return;
      const run = this.run;
      const how = this.accepted(uci);
      const m = this.pos.moveFromUci(uci);
      if (!m) return;
      if (!how) {
        // Show the wrong move for a moment, then take it back.
        this.wrong++;
        this.helped = true;
        this.state = 'wait';
        const text = moveName(this.pos, uci);
        this.pos.makeMove(m);
        this.board.set({ pos: this.pos, lastMove: m, badge: { sq: moveTo(m), cls: 'blunder' }, movable: null, arrows: [] });
        this.feedback = { cls: 'bad', text: `${text} is not it. Try again.` };
        this.renderPanel();
        await sleep(750);
        if (run !== this.run) return;
        this.pos.unmakeMove();
        this.state = 'play';
        this.render();
        return;
      }
      this.pos.makeMove(m);
      this.lastMove = m;
      this.hint = 0;
      const last = how === 'alt' || this.step >= this.p.line.length - 1;
      if (last) return this.finish(how === 'alt');
      this.feedback = { cls: 'good', text: 'Correct. Keep going.' };
      this.state = 'wait';
      this.render({ badge: { sq: moveTo(m), cls: 'best' } });
      await sleep(550);
      if (run !== this.run) return;
      const reply = this.pos.moveFromUci(this.p.line[this.step + 1]);
      this.pos.makeMove(reply);
      this.lastMove = reply;
      this.step += 2;
      this.state = 'play';
      this.render();
    },

    finish(alt) {
      const clean = !this.helped;
      const p = progress.get();
      const before = p.done[this.p.id];
      this.delta = rate(this.stage, this.p, clean);
      const solvedBefore = before === 'clean' || before === 'solved';
      if (clean) p.done[this.p.id] = 'clean';
      else if (this.solutionShown) p.done[this.p.id] = solvedBefore ? before : 'failed';
      else p.done[this.p.id] = before === 'clean' ? 'clean' : 'solved';
      progress.save();
      this.state = 'done';
      this.feedback = clean
        ? { cls: 'good', text: alt ? 'Solved! That move works too.' : 'Solved!' }
        : this.solutionShown
          ? { cls: 'info', text: 'That is the solution.' }
          : { cls: 'good', text: 'Solved, with a little help.' };
      this.render({ badge: this.lastMove ? { sq: moveTo(this.lastMove), cls: this.solutionShown ? 'forced' : 'best' } : null });
    },

    async showSolution() {
      if (this.state === 'done') return;
      this.helped = true;
      this.solutionShown = true;
      const run = ++this.run;
      this.state = 'wait';
      this.feedback = { cls: 'info', text: 'Here is the solution.' };
      for (let i = this.step; i < this.p.line.length; i++) {
        const m = this.pos.moveFromUci(this.p.line[i]);
        if (!m) break;
        this.pos.makeMove(m);
        this.lastMove = m;
        this.render();
        await sleep(650);
        if (run !== this.run) return;
      }
      this.step = this.p.line.length;
      this.finish(false);
    },

    showHint() {
      if (this.state !== 'play') return;
      this.helped = true;
      this.hint = Math.min(2, this.hint + 1);
      this.render();
    },

    retry() {
      const id = this.p.id;
      this.solutionShown = false;
      this.open(id);
    },

    next() {
      this.solutionShown = false;
      const n = pickNext(this.stage, this.p);
      if (n) location.hash = `#/train/p/${n.id}`;
      else location.hash = `#/train/${this.stage}`;
    },

    render(extra = {}) {
      const pos = this.pos;
      const m = this.state === 'play' ? this.pos.moveFromUci(this.p.line[this.step]) : 0;
      let arrows = [];
      let selected = null;
      if (this.state === 'play' && this.hint && m) {
        if (this.hint >= 2) arrows = [{ move: m, color: '#5f9e3a' }];
        else if (!moveDrop(m)) selected = { sq: moveFrom(m) };
      }
      this.board.set({
        pos,
        flipped: this.flipped,
        lastMove: this.lastMove || 0,
        movable: this.state === 'play' ? this.color : null,
        badge: extra.badge || null,
        arrows,
      });
      if (selected) {
        this.board.selected = selected;
        this.board.render();
      }
      this.dropSel = null;
      this.renderBars();
      this.renderPanel();
    },

    renderBars() {
      const bottom = this.flipped ? BLACK : WHITE;
      const lbl = c => (c === this.color ? 'You' : 'Stockhorse');
      const canDrop = this.state === 'play';
      $('#trBarBottom').innerHTML = barsHtml(this.board, this.pos, bottom, lbl(bottom), canDrop, this.dropSel);
      $('#trBarTop').innerHTML = barsHtml(this.board, this.pos, bottom ^ 1, lbl(bottom ^ 1), canDrop, this.dropSel);
      const hintDrop = this.state === 'play' && this.hint === 1 ? moveDrop(this.pos.moveFromUci(this.p.line[this.step]) || 0) : 0;
      if (hintDrop) {
        const bar = this.color === bottom ? '#trBarBottom' : '#trBarTop';
        const el = $(`${bar} .res[data-type="${hintDrop}"]`);
        if (el) el.classList.add('hinted');
      }
    },

    renderPanel() {
      const p = this.p;
      const S = STAGES[this.stage];
      const prog = progress.get();
      const done = this.state === 'done';
      const fb = this.feedback;
      const hintText = this.state === 'play' && this.hint
        ? (() => {
          const m = this.pos.moveFromUci(p.line[this.step]);
          if (!m) return '';
          if (moveDrop(m)) return this.hint >= 2 ? `Drop a ${window.Pieces.NAMES[LETTERS[moveDrop(m)]].toLowerCase()} on the marked square.` : `The move is a drop from your reserve.`;
          const piece = window.Pieces.NAMES[LETTERS[this.pos.board[moveFrom(m)] & 7]].toLowerCase();
          return this.hint >= 2 ? `Play the arrow.` : `Move your ${piece} (highlighted).`;
        })()
        : '';
      const solverMoves = Math.ceil(p.line.length / 2);
      const progressText = `${Math.min(this.solverStepIndex() + (done ? 1 : 0), solverMoves)} of ${solverMoves} move${solverMoves === 1 ? '' : 's'}`;
      $('#trPanel').innerHTML = `
        <div class="train-crumbs"><a href="#/train">Train</a> › <a href="#/train/${this.stage}">${S.title}</a></div>
        <div class="pz-head">
          <div class="pz-turn ${colorKey(this.color)}">${pieceSvg('K', colorKey(this.color))}</div>
          <div>
            <div class="pz-goal-big">${esc(p.goal)}</div>
            <div class="pz-meta">${levelDots(p.level)} <span>${LEVELS[p.level].name} · ${p.rating}</span> · <span>${esc(p.group)}</span></div>
          </div>
        </div>
        ${fb ? `<div class="pz-feedback ${fb.cls}">${esc(fb.text)}${!done && this.state === 'play' && solverMoves > 1 ? `<small>${progressText}</small>` : ''}</div>` : `<div class="pz-feedback">Find the best move for ${colorName(this.color)}.${solverMoves > 1 ? `<small>The solution is ${solverMoves} moves long.</small>` : ''}</div>`}
        ${hintText ? `<div class="pz-hint">💡 ${esc(hintText)}</div>` : ''}
        ${done ? `
          <div class="pz-explain">
            <h3>${esc(p.title)}</h3>
            <p class="pz-line">${esc(numberedLine(p.fen, p.line))}</p>
            <p>${esc(p.explain)}</p>
            ${p.result ? `<p class="pz-result">${esc(p.result)}</p>` : ''}
            ${this.delta !== null && this.delta !== 0 ? `<p class="pz-rating">Rating ${prog.rating[this.stage]} <b class="${this.delta > 0 ? 'up' : 'down'}">${this.delta > 0 ? '+' : ''}${this.delta}</b></p>` : `<p class="pz-rating">Rating ${prog.rating[this.stage]}</p>`}
          </div>` : ''}
        <div class="controls">
          ${done
            ? `<button class="btn primary" data-pz="next">Next puzzle</button><button class="btn" data-pz="retry">Try again</button><button class="btn" data-pz="analyse">Analyse</button>`
            : `<button class="btn" data-pz="hint" ${this.state === 'play' && this.hint < 2 ? '' : 'disabled'}>Hint</button><button class="btn" data-pz="solution" ${this.state === 'play' ? '' : 'disabled'}>Show solution</button><button class="btn" data-pz="skip">Skip</button>`}
          <button class="btn" data-pz="flip" title="Flip board">⇅</button>
        </div>`;
    },
  };

  function findPuzzle(id) {
    for (const stage of Object.keys(STAGES)) {
      const p = puzzles(stage).find(x => x.id === id);
      if (p) return { p, stage };
    }
    return null;
  }

  // --- openings ---------------------------------------------------------------------------

  function renderOpenings() {
    const ops = openings();
    const prog = progress.get();
    const principles = data().openingPrinciples || [];
    const families = [];
    for (const o of ops) {
      let f = families.find(x => x.name === o.family);
      if (!f) families.push((f = { name: o.family, items: [] }));
      f.items.push(o);
    }
    $('#trOpenings').innerHTML = `
      <div class="train-crumbs"><a href="#/train">Train</a> › Openings</div>
      <div class="train-listhead"><div>
        <h1>Openings</h1>
        <p class="muted">Each opening has a main line Stockhorse plays, side variations, and the plans behind them. Study a line, then practise it: you play your side from memory and Stockhorse plays the book replies.</p>
      </div></div>
      ${principles.length ? `
        <details class="op-principles" open>
          <summary>Opening principles for Maki</summary>
          <ol>${principles.map(x => `<li><b>${esc(x.title)}.</b> ${esc(x.text)}</li>`).join('')}</ol>
        </details>` : ''}
      ${families.map(f => `
        <h2 class="op-family">${esc(f.name)}</h2>
        <ul class="op-grid">
          ${f.items.map(o => {
            const st = prog.openings[o.id];
            return `<li><a class="op-tile" href="#/train/o/${esc(o.id)}">
              <span class="op-side ${o.side}">${pieceSvg('N', o.side)}</span>
              <span class="op-name">${esc(o.name)}${st && st.clean ? ' <span class="pz-st ok" title="Practised without a mistake">✓</span>' : ''}</span>
              <span class="op-moves">${esc(numberedLine(START_FEN, o.moves.slice(0, 6)))}${o.moves.length > 6 ? ' …' : ''}</span>
              <span class="op-sum">${esc(o.summary)}</span>
              <span class="op-foot">For ${o.side === 'w' ? 'White' : 'Black'} · ${o.variations ? o.variations.length : 0} variation${o.variations && o.variations.length === 1 ? '' : 's'}${o.eval ? ` · eval ${esc(o.eval)}` : ''}</span>
            </a></li>`;
          }).join('')}
        </ul>`).join('')}
      ${ops.length ? '' : '<p class="muted">No openings in this version of the trainer.</p>'}`;
  }

  const opening = {
    o: null,
    line: 0, // 0 = main line, k = variations[k - 1]
    ply: 0, // position shown: after `ply` moves of the line
    mode: 'study', // study | practise
    flipped: false,
    pos: null,
    mistakes: 0,
    state: 'idle', // practise: play | wait | done
    feedback: null,
    run: 0,
    hint: false,

    moves() {
      const o = this.o;
      return this.line === 0 ? o.moves : o.variations[this.line - 1].moves;
    },

    open(id) {
      const o = openings().find(x => x.id === id);
      if (!o) {
        location.hash = '#/train/openings';
        return;
      }
      this.o = o;
      this.line = 0;
      this.ply = 0;
      this.mode = 'study';
      this.flipped = o.side === 'b';
      this.feedback = null;
      this.run++;
      showPage('trArena');
      $('#trNav').hidden = false;
      this.render();
    },

    position(ply = this.ply) {
      const pos = new Position(START_FEN);
      for (const u of this.moves().slice(0, ply)) {
        const m = pos.moveFromUci(u);
        if (!m) break;
        pos.makeMove(m);
      }
      return pos;
    },

    comment(ply) {
      // Comments belong to the main line; a variation shares them up to where it branches.
      const o = this.o;
      if (ply < 1) return '';
      const mv = this.moves();
      if (this.line === 0 || o.moves.slice(0, ply).join(' ') === mv.slice(0, ply).join(' ')) {
        return (o.comments && o.comments[String(ply - 1)]) || '';
      }
      return '';
    },

    go(ply) {
      if (this.mode !== 'study') return;
      this.ply = Math.max(0, Math.min(this.moves().length, ply));
      this.render();
    },

    step(k) {
      const n = this.moves().length;
      if (k === 'start') this.go(0);
      else if (k === 'prev') this.go(this.ply - 1);
      else if (k === 'next') this.go(this.ply + 1);
      else if (k === 'end') this.go(n);
    },

    // Practise: the player plays their side; the book replies come by themselves.
    practise() {
      this.mode = 'practise';
      this.ply = 0;
      this.mistakes = 0;
      this.hint = false;
      this.feedback = { cls: 'info', text: `Play the ${this.line === 0 ? 'main line' : `“${this.o.variations[this.line - 1].name}”`} as ${this.o.side === 'w' ? 'White' : 'Black'}.` };
      this.flipped = this.o.side === 'b';
      this.run++;
      this.state = 'play';
      this.autoReply();
    },

    mySide() {
      return this.o.side === 'w' ? WHITE : BLACK;
    },

    async autoReply() {
      const run = this.run;
      const mv = this.moves();
      this.render();
      while (this.ply < mv.length && this.position().side !== this.mySide()) {
        this.state = 'wait';
        this.render();
        await sleep(450);
        if (run !== this.run) return;
        this.ply++;
      }
      if (this.ply >= mv.length) return this.practiseDone();
      this.state = 'play';
      this.render();
    },

    async onMove(uci) {
      if (this.mode !== 'practise' || this.state !== 'play') return;
      const mv = this.moves();
      const want = mv[this.ply];
      const pos = this.position();
      if (uci === want) {
        this.ply++;
        this.hint = false;
        this.feedback = { cls: 'good', text: this.comment(this.ply) || 'Book move.' };
        if (this.ply >= mv.length) return this.practiseDone();
        return this.autoReply();
      }
      // Another opening line in this family may continue here; say so instead of a flat no.
      const run = this.run;
      this.mistakes++;
      const played = moveName(pos, uci);
      const other = [this.o.moves, ...(this.o.variations || []).map(v => v.moves)]
        .findIndex(l => l.slice(0, this.ply).join(' ') === mv.slice(0, this.ply).join(' ') && l[this.ply] === uci);
      const name = other === 0 ? 'the main line' : other > 0 ? `the “${this.o.variations[other - 1].name}” variation` : '';
      this.feedback = {
        cls: 'bad',
        text: name ? `${played} is ${name}, but here you are practising another line. Try again.` : `${played} is not the book move here. Try again, or ask for a hint.`,
      };
      this.state = 'wait';
      const m = pos.moveFromUci(uci);
      pos.makeMove(m);
      this.board.set({ pos, flipped: this.flipped, lastMove: m, movable: null, badge: { sq: moveTo(m), cls: 'mistake' }, arrows: [] });
      this.renderSide();
      await sleep(750);
      if (run !== this.run) return;
      this.state = 'play';
      this.render();
    },

    practiseDone() {
      this.state = 'done';
      const prog = progress.get();
      const st = prog.openings[this.o.id] || { runs: 0, clean: 0 };
      st.runs++;
      if (!this.mistakes) st.clean++;
      prog.openings[this.o.id] = st;
      progress.save();
      this.feedback = {
        cls: this.mistakes ? 'info' : 'good',
        text: this.mistakes ? `Line complete, with ${this.mistakes} mistake${this.mistakes === 1 ? '' : 's'}. Practise it again until it is clean.` : 'Line complete without a mistake!',
      };
      this.render();
    },

    stopPractise() {
      this.mode = 'study';
      this.run++;
      this.state = 'idle';
      this.feedback = null;
      this.render();
    },

    render() {
      const pos = this.position();
      const mv = this.moves();
      let lastMove = 0;
      if (this.ply > 0) {
        const prev = this.position(this.ply - 1);
        lastMove = prev.moveFromUci(mv[this.ply - 1]) || 0;
      }
      const practising = this.mode === 'practise' && this.state === 'play';
      const arrows = [];
      if (this.mode === 'study' && this.ply < mv.length) {
        const m = pos.moveFromUci(mv[this.ply]);
        if (m) arrows.push({ move: m, color: '#3d7fd1' });
      }
      if (practising && this.hint) {
        const m = pos.moveFromUci(mv[this.ply]);
        if (m) arrows.push({ move: m, color: '#5f9e3a' });
      }
      this.board.set({ pos, flipped: this.flipped, lastMove, movable: practising ? this.mySide() : null, badge: null, arrows });
      this.renderSide();
    },

    renderSide() {
      const pos = this.position();
      const o = this.o;
      const mv = this.moves();
      const bottom = this.flipped ? BLACK : WHITE;
      const practising = this.mode === 'practise';
      const lbl = c => (practising ? (c === this.mySide() ? 'You' : 'Book') : colorName(c));
      $('#trBarBottom').innerHTML = barsHtml(this.board, pos, bottom, lbl(bottom), practising && this.state === 'play', null);
      $('#trBarTop').innerHTML = barsHtml(this.board, pos, bottom ^ 1, lbl(bottom ^ 1), practising && this.state === 'play', null);
      for (const b of $$('#trNav [data-trstep]')) b.disabled = practising;

      // The line as clickable moves, with the current comment below.
      const p0 = new Position(START_FEN);
      const parts = [];
      mv.forEach((u, i) => {
        const m = p0.moveFromUci(u);
        if (!m) return;
        const hidden = practising && i >= this.ply;
        const no = p0.side === WHITE ? `<span class="no">${p0.moveNo}.</span>` : '';
        parts.push(`${no}<button class="tmv ${i + 1 === this.ply ? 'cur' : ''}" data-ply="${i + 1}" ${practising ? 'disabled' : ''}>${hidden ? '···' : esc(p0.moveToText(m))}</button>`);
        p0.makeMove(m);
      });
      const lines = [{ name: 'Main line' }, ...(o.variations || [])];
      const comment = this.comment(this.ply);
      const fb = this.feedback;
      $('#trPanel').innerHTML = `
        <div class="train-crumbs"><a href="#/train">Train</a> › <a href="#/train/openings">Openings</a></div>
        <div>
          <h2 class="op-title">${esc(o.name)}</h2>
          <div class="pz-meta">${esc(o.family)} · for ${o.side === 'w' ? 'White' : 'Black'}${o.eval ? ` · Stockhorse ${esc(o.eval)} at the end` : ''}</div>
        </div>
        <p class="op-summary">${esc(o.summary)}</p>
        <label class="field op-linepick">Line
          <select class="btn" id="trLine" ${practising && this.state !== 'done' ? 'disabled' : ''}>
            ${lines.map((l, i) => `<option value="${i}" ${i === this.line ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}
          </select>
        </label>
        ${this.line > 0 && o.variations[this.line - 1].note ? `<p class="op-note">${esc(o.variations[this.line - 1].note)}</p>` : ''}
        <div class="op-line">${parts.join(' ')}</div>
        ${fb ? `<div class="pz-feedback ${fb.cls}">${esc(fb.text)}</div>` : ''}
        ${!practising ? `<div class="op-comment">${this.ply === 0 ? 'Step through the line with ▶ or the arrow keys. The blue arrow shows the next move.' : comment ? esc(comment) : '<span class="muted">No comment on this move.</span>'}</div>` : ''}
        <div class="controls">
          ${practising
            ? `${this.state === 'done' ? '<button class="btn primary" data-op="practise">Practise again</button>' : `<button class="btn" data-op="hint" ${this.state === 'play' && !this.hint ? '' : 'disabled'}>Hint</button>`}<button class="btn" data-op="study">Back to study</button>`
            : `<button class="btn primary" data-op="practise">Practise this line</button>`}
          <button class="btn" data-op="play" title="Play Stockhorse from the end of this line">Play from here</button>
          <button class="btn" data-op="analyse">Analyse</button>
        </div>
        <div class="op-principles-mini">
          <h3>Plans and principles</h3>
          <ul>${(o.principles || []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>`;
      $('#trLine').onchange = () => {
        this.line = +$('#trLine').value;
        this.ply = 0;
        if (this.mode === 'practise') this.practise();
        else this.render();
      };
    },
  };

  // --- wiring -----------------------------------------------------------------------------

  let current = null; // 'puzzle' | 'opening' | null

  function init(api) {
    ui = api;
    ({ $, $$, esc, pieceSvg, store, toast } = api);
    const root = $('#view-train');
    root.innerHTML = skeleton();
    const board = new api.BoardView($('#trBoard'), {
      onMove: uci => (current === 'opening' ? opening.onMove(uci) : solver.onMove(uci)),
    });
    solver.board = board;
    opening.board = board;
    board.onSelect = sel => {
      const drop = sel && sel.drop ? sel.drop : null;
      if (current === 'puzzle') {
        solver.dropSel = drop;
        solver.renderBars();
      }
    };
    for (const id of ['#trBarTop', '#trBarBottom']) {
      $(id).addEventListener('click', e => {
        const b = e.target.closest('.res.usable');
        if (b) board.selectDrop(+b.dataset.type);
      });
    }
    $('#trNav').addEventListener('click', e => {
      const b = e.target.closest('[data-trstep]');
      if (b && current === 'opening') opening.step(b.dataset.trstep);
    });
    $('#trFlip').onclick = () => flip();
    $('#trPanel').addEventListener('click', e => {
      const pz = e.target.closest('[data-pz]');
      if (pz && current === 'puzzle') {
        const a = pz.dataset.pz;
        if (a === 'hint') solver.showHint();
        else if (a === 'solution') solver.showSolution();
        else if (a === 'skip' || a === 'next') solver.next();
        else if (a === 'retry') solver.retry();
        else if (a === 'flip') flip();
        else if (a === 'analyse') ui.openAnalysis(solver.p.fen, solver.p.line.slice(), 0);
        return;
      }
      const op = e.target.closest('[data-op]');
      if (op && current === 'opening') {
        const a = op.dataset.op;
        if (a === 'practise') opening.practise();
        else if (a === 'study') opening.stopPractise();
        else if (a === 'hint') {
          opening.hint = true;
          opening.mistakes++;
          opening.render();
        } else if (a === 'play') ui.openPve(opening.position(opening.moves().length).fen());
        else if (a === 'analyse') ui.openAnalysis(START_FEN, opening.moves().slice(), opening.ply);
        return;
      }
      const t = e.target.closest('[data-ply]');
      if (t && current === 'opening') opening.go(+t.dataset.ply);
    });
    document.addEventListener('keydown', e => {
      if (current !== 'opening' || $('#view-train').hidden || e.target.matches('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = { ArrowLeft: 'prev', ArrowRight: 'next', Home: 'start', End: 'end' }[e.key];
      if (k) {
        e.preventDefault();
        opening.step(k);
      } else if (e.key === 'f') flip();
    });
  }

  function flip() {
    if (current === 'puzzle') {
      solver.flipped = !solver.flipped;
      solver.render();
    } else if (current === 'opening') {
      opening.flipped = !opening.flipped;
      opening.render();
    }
  }

  // Called by the router for every #/train… address.
  function show(hash) {
    solver.run++;
    opening.run++;
    current = null;
    const h = hash.replace(/^#\/train\/?/, '');
    let m;
    if ((m = /^p\/([\w-]+)$/.exec(h))) {
      current = 'puzzle';
      solver.solutionShown = false;
      solver.open(m[1]);
    } else if ((m = /^o\/([\w-]+)$/.exec(h))) {
      current = 'opening';
      opening.open(m[1]);
    } else if (h === 'openings') {
      showPage('trOpenings');
      renderOpenings();
    } else if (h === 'middlegame' || h === 'endgame') {
      showPage('trList');
      renderList(h);
    } else {
      showPage('trHub');
      renderHub();
    }
  }

  function hide() {
    solver.run++;
    opening.run++;
    current = null;
  }

  window.Train = { init, show, hide, STAGES, LEVELS };
})();
