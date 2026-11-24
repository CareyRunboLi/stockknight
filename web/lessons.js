'use strict';
// The Learn section's lessons: what each step shows and, for exercises, what counts as solved.
// Rules as in docs/RULES.md (ruleset knightchess-2). web/tutorial.js runs these on the board;
// web/test-tutorial.js checks that every position is legal and every exercise can be solved.
//
// A step is { fen, text, ... } with optional:
//   marks   { square: 'hl' | 'x' }  squares tinted on the board ('x' = a square to keep off)
//   show    'c3'                      dots on every square the piece on c3 can move to
//   arrows  ['b1c3', 'R@c4']          arrows (and circles for drops)
//   task    the exercise; without one the step is read and the learner presses Next:
//     { type: 'stars', targets: [...] }   collect every star; you keep the move
//     { type: 'capture' }                 take every enemy piece but the king; you keep the move
//     { type: 'check' | 'mate' | 'stalemate' }  one move that does it
//     { type: 'escape', how: 'move' | 'capture' | 'block' }  get out of check that way
//     { type: 'attack', target: 'c5', drop: 'P' }  one move (a drop of that type, if given)
//                                                    after which the piece on target is attacked
//     { type: 'moves', moves: [...] }     one of these moves
//   goal    the one-line goal shown above the board for an exercise
//   hint    shown when the learner asks for a hint (the hint also draws an arrow when it can)
//   success shown when the exercise is solved
//   wrong   shown after a move that does not solve a one-move exercise

(function (root) {
  // A position from a list of pieces, such as 'Ka1 Rc3 kf6': capitals are White, lower case
  // Black. reserve as in a FEN ('-' when both are empty), side 'w' or 'b'.
  function P(spec, reserve = '-', side = 'w') {
    const board = Array(36).fill('');
    for (const t of spec.trim().split(/\s+/)) {
      const file = t.charCodeAt(1) - 97, rank = t.charCodeAt(2) - 49;
      board[rank * 6 + file] = t[0];
    }
    const rows = [];
    for (let r = 5; r >= 0; r--) {
      let row = '', empty = 0;
      for (let f = 0; f < 6; f++) {
        const c = board[r * 6 + f];
        if (!c) empty++;
        else {
          if (empty) row += empty;
          empty = 0;
          row += c;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    return `${rows.join('/')}[${reserve}] ${side} 0 1`;
  }

  const START = 'rnkqnb/pppppp/6/6/PPPPPP/BNQKNR[PPRBpprb] w 0 1';
  const ranks = (...rs) => {
    const out = {};
    for (const r of rs) for (const f of 'abcdef') out[f + r] = 'hl';
    return out;
  };

  const CHAPTERS = [
    { id: 'basics', title: 'Meet the pieces', blurb: 'The board, and how each of the six pieces moves.' },
    { id: 'drops', title: 'Captures and drops', blurb: 'Taking pieces, and the reserve that makes Maki different from chess.' },
    { id: 'winning', title: 'Check, mate and stalemate', blurb: 'How a game is won, and the rule that surprises chess players.' },
    { id: 'play', title: 'Playing well', blurb: 'What the pieces are worth, simple tricks, and a plan for your first games.' },
  ];

  const LESSONS = [
    // --- Meet the pieces ----------------------------------------------------------------------
    {
      id: 'board', chapter: 'basics', piece: 'K', title: 'The board',
      blurb: 'A 6×6 board, two armies and two reserves.',
      steps: [
        {
          fen: START,
          text: `<p>Maki is a game for two players, <b>White</b> and <b>Black</b>, on a board of 6 × 6 squares. White starts at the bottom and always makes the first move. Then the players take turns, one move each.</p>
            <p>Each side has a king, a queen, two knights, a rook, a bishop and six pawns on the board.</p>`,
        },
        {
          fen: START,
          marks: { a1: 'hl', b1: 'hl', c1: 'hl', d1: 'hl', e1: 'hl', f1: 'hl', a6: 'hl', b6: 'hl', c6: 'hl', d6: 'hl', e6: 'hl', f6: 'hl' },
          text: `<p>The columns are called <b>files</b> and are lettered <b>a</b> to <b>f</b> from left to right. The rows are called <b>ranks</b> and are numbered <b>1</b> to <b>6</b> from White's side.</p>
            <p>So every square has a name: White's king stands on <b>d1</b>, Black's king on <b>c6</b>. The letters and numbers are printed along the edge of the board.</p>`,
        },
        {
          fen: START,
          marks: ranks(1, 2, 3),
          text: `<p>The board is split into two halves. Ranks 1 to 3 are <b>White's half</b> (tinted here) and ranks 4 to 6 are <b>Black's half</b>.</p>
            <p>The halves matter for one piece only, the pawn: a pawn becomes stronger once it crosses into the other player's half. You will see how in the pawn lesson.</p>`,
        },
        {
          fen: START,
          text: `<p>Look beside the board: each player also has a <b>reserve</b> of 2 pawns, a rook and a bishop.</p>
            <p>Instead of moving a piece, you may <b>drop</b> a piece from your reserve onto any empty square. Drops are what make Maki different from chess, and they have their own lesson later.</p>`,
        },
        {
          fen: START,
          text: `<p>The aim of the game is to leave your opponent with <b>no legal move</b>. The usual way is <b>checkmate</b>: attacking the king so that it cannot escape.</p>
            <p>Let's start with how the pieces move. In each exercise you play White.</p>`,
        },
      ],
    },
    {
      id: 'rook', chapter: 'basics', piece: 'R', title: 'The rook',
      blurb: 'Straight lines, as far as it likes.',
      steps: [
        {
          fen: P('Kf1 Rc3 ka6'),
          show: 'c3',
          text: `<p>The <b>rook</b> moves in a straight line along a rank or a file, as many squares as it likes. It cannot jump over other pieces.</p>
            <p>The dots show every square this rook can reach in one move. It is the strongest piece in Maki.</p>`,
        },
        {
          fen: P('Ka1 Rc2 kf6'),
          task: { type: 'stars', targets: ['c5', 'e5', 'e2'] },
          goal: 'Collect all the stars with the rook.',
          text: `<p>Move the rook onto each star. Click the rook, then click the square you want, or drag it there.</p>
            <p>In these exercises Black does not move, so you can take as many moves as you need.</p>`,
          hint: 'Go up the c-file first, then along the fifth rank.',
          success: 'Well done. The rook covers the board quickly when the lines are open.',
        },
        {
          fen: P('Ka1 Rb2 kf6 pd4'),
          task: { type: 'stars', targets: ['b5', 'e5', 'e3', 'a3'] },
          goal: 'Collect all four stars.',
          text: `<p>The black pawn on d4 is in the way: the rook cannot jump over it. Plan a route around it.</p>`,
          hint: 'From b5 go to e5, then down the e-file to e3, then along the third rank.',
          success: 'Right. A piece in the way blocks a rook completely.',
        },
      ],
    },
    {
      id: 'bishop', chapter: 'basics', piece: 'B', title: 'The bishop',
      blurb: 'Diagonals only, and always the same colour.',
      steps: [
        {
          fen: P('Kf1 Bc3 ka6'),
          show: 'c3',
          text: `<p>The <b>bishop</b> moves diagonally, as many squares as it likes, and cannot jump over pieces.</p>
            <p>Because it only moves diagonally, a bishop stays on squares of one colour for the whole game.</p>`,
        },
        {
          fen: P('Kf1 Bc1 ka6'),
          task: { type: 'stars', targets: ['e3', 'c5', 'b4'] },
          goal: 'Collect all the stars with the bishop.',
          text: `<p>Every star is on the bishop's colour, so it can reach them all.</p>`,
          hint: 'Start with e3, then c5.',
          success: 'Good. Notice that the bishop never left its colour.',
        },
        {
          fen: P('Ka1 Bd1 kf6'),
          task: { type: 'stars', targets: ['f3', 'c6', 'a4'] },
          goal: 'Collect all three stars.',
          text: `<p>One more. On a 6 × 6 board the diagonals are short, so the bishop is a little weaker than in chess.</p>`,
          hint: 'd1 to f3, then all the way to c6.',
          success: 'Well done.',
        },
      ],
    },
    {
      id: 'knight', chapter: 'basics', piece: 'N', title: 'The knight',
      blurb: 'The L-shaped jump, over anything in the way.',
      steps: [
        {
          fen: P('Kf1 Nc3 ka6 pc4 pd3'),
          show: 'c3',
          text: `<p>The <b>knight</b> moves in an L: two squares in a straight line and then one to the side. It is the only piece that <b>jumps</b>: pieces in between do not stop it.</p>
            <p>The black pawns next to this knight do not matter at all.</p>`,
        },
        {
          fen: P('Kf1 Nb1 kf6'),
          task: { type: 'stars', targets: ['d2', 'e4', 'c5', 'a6'] },
          goal: 'Collect all the stars with the knight.',
          text: `<p>Each star is exactly one knight jump from the one before.</p>`,
          hint: 'b1 to d2, then e4, c5 and a6.',
          success: 'Nice jumping.',
        },
        {
          fen: P('Ka1 Nc3 kf6'),
          task: { type: 'stars', targets: ['d3'] },
          goal: 'Reach the star next door.',
          text: `<p>A knight is clumsy over short distances: to reach a square right beside it, it needs <b>three</b> jumps.</p>`,
          hint: 'One way: c3 to e2, then f4, then d3.',
          success: 'Three jumps for one square. Knights love the middle of the board, where they reach the most squares.',
        },
      ],
    },
    {
      id: 'king-queen', chapter: 'basics', piece: 'Q', title: 'The king and the queen',
      blurb: 'Both step one square. The queen is not the chess queen.',
      steps: [
        {
          fen: P('Kc3 kf6'),
          show: 'c3',
          text: `<p>The <b>king</b> steps one square in any direction. It is the piece that matters most: when your king is checkmated, you lose.</p>
            <p>There is no castling in Maki.</p>`,
        },
        {
          fen: P('Ka1 Qc3 kf6'),
          show: 'c3',
          text: `<p>The <b>queen</b> moves exactly like the king: one square in any direction.</p>
            <p>If you know chess, be careful: this is <b>not</b> the long-range chess queen. It is worth about as much as a knight and a pawn, and less than a rook.</p>`,
        },
        {
          fen: P('Kf1 Qc2 ka6'),
          task: { type: 'stars', targets: ['d4', 'b5', 'a3'] },
          goal: 'Collect the stars with the queen.',
          text: `<p>One step at a time.</p>`,
          hint: 'Each star is two steps from the one before.',
          success: 'Done. Slow but steady.',
        },
        {
          fen: P('Kb1 ke5'),
          marks: { d4: 'x', d5: 'x', d6: 'x', e4: 'x', e6: 'x', f4: 'x', f5: 'x', f6: 'x' },
          task: { type: 'stars', targets: ['c4', 'd2', 'f2'] },
          goal: 'Walk your king to the stars.',
          text: `<p>A king attacks every square around it, so the two kings can <b>never stand next to each other</b>. Your king may not step onto the marked squares beside the black king.</p>`,
          hint: 'Go b2, b3, c4, then d3, d2, e2 and f2.',
          success: 'Good. Keeping the kings apart decides many endgames.',
        },
      ],
    },
    {
      id: 'pawn', chapter: 'basics', piece: 'P', title: 'The pawn',
      blurb: 'Straight ahead at home, sideways too in enemy land.',
      steps: [
        {
          fen: P('Kf1 Pc2 ka6'),
          show: 'c2',
          marks: ranks(1, 2, 3),
          text: `<p>The <b>pawn</b> works differently from the chess pawn. In its <b>own half</b> (tinted) it moves one square straight forward, and nothing else.</p>
            <p>There is no two-square first move.</p>`,
        },
        {
          fen: P('Kf1 Pc4 ka6'),
          show: 'c4',
          marks: ranks(4, 5, 6),
          text: `<p>Once a pawn is in the <b>opponent's half</b> (ranks 4 to 6 for White), it may move one square forward, <b>or one square left or right</b>.</p>
            <p>That makes an advanced pawn a real nuisance for the opponent.</p>`,
        },
        {
          fen: P('Kf1 Pc6 kf4'),
          show: 'c6',
          text: `<p>A pawn may go all the way to the last rank, but it is <b>not promoted</b>. There it can only step sideways.</p>
            <p>A pawn never moves backwards, and never diagonally.</p>`,
        },
        {
          fen: P('Kf1 Pb2 ka6'),
          task: { type: 'stars', targets: ['b4', 'd4', 'd6'] },
          goal: 'Walk the pawn to every star.',
          text: `<p>March forward first. Once you cross into Black's half you can also step sideways.</p>`,
          hint: 'b3, b4, then sideways to c4 and d4, then up to d5 and d6.',
          success: 'Exactly. Sideways steps only work in the enemy half.',
        },
        {
          fen: P('Kf1 Pc3 ka6 nc4 bd4 rd5'),
          task: { type: 'capture' },
          goal: 'Capture all three black pieces with the pawn.',
          text: `<p>A pawn <b>captures the same way it moves</b>: straight ahead, and in the enemy half also to the left or right. It never captures diagonally.</p>
            <p>To capture, move onto the enemy piece. It is removed from the board.</p>`,
          hint: 'c3 takes c4, then sideways onto d4, then straight ahead onto d5.',
          success: 'Well played. That pawn ate a knight, a bishop and a rook.',
        },
      ],
    },

    // --- Captures and drops -------------------------------------------------------------------
    {
      id: 'capture', chapter: 'drops', piece: 'N', title: 'Capturing',
      blurb: 'Captured pieces are gone for good.',
      steps: [
        {
          fen: P('Ka1 Nc3 kf6 pd5 bb4'),
          arrows: ['c3d5'],
          text: `<p>Every piece captures by moving onto a square with an enemy piece. The enemy piece is removed from the game.</p>
            <p>If you have played shogi or crazyhouse: in Maki captured pieces do <b>not</b> join your reserve. They are simply gone.</p>
            <p>The king can never be captured. Instead you attack it, as the next chapter shows.</p>`,
        },
        {
          fen: P('Ka1 Nc3 kf6 pd5 bb4 rc6'),
          task: { type: 'capture' },
          goal: 'Capture all the black pieces with the knight.',
          text: `<p>Each capture lands the knight on a square from which it can jump to the next piece.</p>`,
          hint: 'Take the pawn on d5 first.',
          success: 'Three captures in three moves.',
        },
        {
          fen: P('Ka1 Rb2 Bf1 kf6 nb5 pd3 be4 pe5'),
          task: { type: 'capture' },
          goal: 'Clear the board: capture all four black pieces.',
          text: `<p>Now with a rook and a bishop. Use whichever piece is quicker each time.</p>`,
          hint: 'The rook takes b5, the bishop takes d3 and then e4, and the rook finishes on e5.',
          success: 'The board is clear.',
        },
      ],
    },
    {
      id: 'drops', chapter: 'drops', piece: 'B', title: 'Drops',
      blurb: 'Place a piece from your reserve on any empty square.',
      steps: [
        {
          fen: P('Ka1 kf6', 'R'),
          task: { type: 'stars', targets: ['d4'] },
          goal: 'Drop your rook on the star.',
          text: `<p>Instead of moving a piece, you may take a piece from your <b>reserve</b> and put it on any empty square. That is a whole move, called a <b>drop</b>.</p>
            <p>Click the rook in your reserve, below the board, then click the star.</p>`,
          hint: 'The reserve is in the bar under the board, on the right.',
          success: 'That is a drop. Once on the board, the rook moves like any other rook.',
        },
        {
          fen: P('Ka1 Pa2 Pb2 Pc2 Pe2 kf6', 'P'),
          task: { type: 'stars', targets: ['d4'] },
          goal: 'Drop a pawn on the star.',
          text: `<p>Pawn drops have one rule: you may not drop a pawn on a <b>file that already has one of your pawns</b>. Here the a, b, c and e files are taken, so only the d and f files are free.</p>
            <p>Otherwise a pawn may be dropped on any empty square, even on the last rank.</p>`,
          hint: 'Click the pawn in your reserve, then d4.',
          success: 'Right. Dropping a pawn straight into the enemy half is often strong.',
        },
        {
          fen: START,
          text: `<p>One more rule: you may drop a rook or bishop only while you have <b>fewer than 2 rooks and bishops on the board</b>.</p>
            <p>At the start you already have a rook and a bishop on the board, so your reserve rook and bishop have to wait until one of those is captured. Your two reserve pawns can be dropped at any time.</p>`,
        },
        {
          fen: P('Ka1 Pa2 Pe2 kf6 nb5 bd5', 'P'),
          task: { type: 'attack', target: 'b5', also: 'd5', drop: 'P' },
          goal: 'Drop a pawn that attacks both black pieces.',
          text: `<p>Drops let you attack from out of nowhere. A pawn in the enemy half attacks the squares in front of it and on both sides.</p>
            <p>Find the pawn drop that attacks the knight <b>and</b> the bishop at once. Black can only save one of them.</p>`,
          hint: 'Which square is next to both b5 and d5?',
          success: 'A pawn fork! Black loses a piece for a pawn.',
          wrong: 'That does not attack both pieces. Look for the square between them.',
        },
      ],
    },

    // --- Check, mate and stalemate ------------------------------------------------------------
    {
      id: 'check', chapter: 'winning', piece: 'K', title: 'Check',
      blurb: 'Attack the king, and get your own king out of trouble.',
      steps: [
        {
          fen: P('Kb1 Re1 ke5', '-', 'b'),
          arrows: ['e1e5'],
          text: `<p>When a piece attacks the enemy king, the king is in <b>check</b>. Here White's rook gives check to the black king.</p>
            <p>A player in check <b>must</b> get out of it at once. You are never allowed to make a move that leaves your own king in check.</p>`,
        },
        {
          fen: P('Ka1 Rd2 ke5'),
          task: { type: 'check' },
          goal: 'Give check to the black king.',
          text: `<p>Move the rook so that it attacks the black king.</p>`,
          hint: 'The rook checks along a rank or a file: try the e-file or the fifth rank.',
          success: 'Check! The king is attacked.',
          wrong: 'That does not attack the king. Put the rook on the same rank or file as it.',
        },
        {
          fen: P('Kc1 kf6 rc6'),
          task: { type: 'escape', how: 'move' },
          goal: 'Your king is in check. Step out of it.',
          text: `<p>There are three ways out of check. The first: <b>move the king</b> to a square that is not attacked.</p>`,
          hint: 'The rook attacks the whole c-file, so step off it.',
          success: 'Safe.',
          wrong: 'Move the king itself this time.',
        },
        {
          fen: P('Ka1 Nc2 kf6 ra3'),
          task: { type: 'escape', how: 'capture' },
          goal: 'Get out of check by capturing the piece that gives it.',
          text: `<p>The second way: <b>capture the checking piece</b>.</p>`,
          hint: 'Your knight on c2 can reach a3.',
          success: 'Out of check, and a rook up.',
          wrong: 'That gets out of check, but this time capture the rook.',
        },
        {
          fen: P('Ka1 kf6 rf1', 'PB'),
          task: { type: 'escape', how: 'block' },
          goal: 'Get out of check by putting something in the way.',
          text: `<p>The third way: <b>block</b> the check by putting a piece between the king and the attacker. In Maki you can block with a drop from your reserve.</p>`,
          hint: 'Drop a pawn or the bishop anywhere between a1 and f1.',
          success: 'Blocked. Drops make defending easier too.',
          wrong: 'That escapes too, but this time block the rook with a drop.',
        },
      ],
    },
    {
      id: 'mate', chapter: 'winning', piece: 'R', title: 'Checkmate',
      blurb: 'Check with no way out: the game is won.',
      steps: [
        {
          fen: P('Kc4 Ra6 ka4', '-', 'b'),
          arrows: ['a6a4'],
          text: `<p>When a king is in check and there is <b>no way out</b> (no safe square, no capture, no block), it is <b>checkmate</b> and the game is over.</p>
            <p>Here the rook checks along the a-file, and White's king covers b3, b4 and b5. Black has no reserve to block with. Checkmate: White wins.</p>`,
        },
        {
          fen: P('Ke1 Ra1 kc6 pb5 pc5 pd5'),
          task: { type: 'mate' },
          goal: 'Checkmate in one move.',
          text: `<p>Black's own pawns block the king in. Find the rook move that ends the game.</p>`,
          hint: 'The black king is on the back rank.',
          success: 'Checkmate along the back rank.',
          wrong: 'Not mate. Which squares can the black king still go to?',
        },
        {
          fen: P('Kc5 Qc4 ka6'),
          task: { type: 'mate' },
          goal: 'Checkmate in one move.',
          text: `<p>The queen gives check from right next to the king. The black king could capture it, unless your own king protects it.</p>`,
          hint: 'Put the queen where your king defends it.',
          success: 'Checkmate. The queen and king together.',
          wrong: 'Not mate. Can the black king capture the queen or run away?',
        },
        {
          fen: P('Kc6 Re1 ka6'),
          task: { type: 'mate' },
          goal: 'Checkmate in one move.',
          text: `<p>Your king already takes away b5 and b6. Use the rook for the rest.</p>`,
          hint: 'Check along the a-file.',
          success: 'Checkmate. The king did half the work.',
          wrong: 'Not mate. The rook needs to give check.',
        },
        {
          fen: P('Kf1 Nd3 ka6 rb6 pa5 pb5'),
          task: { type: 'mate' },
          goal: 'Checkmate in one move.',
          text: `<p>The black king is boxed in by its own pieces. A knight check cannot be blocked.</p>`,
          hint: 'There are two knight checks. One of them can be captured by a pawn.',
          success: 'A smothered mate: the king was trapped by its own army.',
          wrong: 'Not mate. Remember the black pawn on b5 captures straight ahead, onto b4.',
        },
        {
          fen: P('Kf1 Nd3 Pc4 kc6 nb6 rd6'),
          task: { type: 'mate' },
          goal: 'Checkmate in one move, with a pawn.',
          text: `<p>A pawn in the enemy half gives check to a king straight in front of it.</p>`,
          hint: 'Push the c-pawn. Who protects it?',
          success: 'Checkmate by a pawn, protected by the knight.',
          wrong: 'Not mate. Try the pawn.',
        },
        {
          fen: P('Ka1 kf6 pe5 pf5', 'R'),
          task: { type: 'mate' },
          goal: 'Checkmate in one move, with a drop.',
          text: `<p>Drops can give checkmate too. You have a rook in reserve.</p>`,
          hint: 'Drop the rook on the sixth rank, not right next to the king.',
          success: 'Mate by a drop. Always look at what your reserve can do, and what your opponent\'s can.',
          wrong: 'Not mate. The king can still escape or capture.',
        },
      ],
    },
    {
      id: 'stalemate', chapter: 'winning', piece: 'Q', title: 'Stalemate wins',
      blurb: 'No legal move means you lose, check or not.',
      steps: [
        {
          fen: P('Kc5 Nb3 ka6', '-', 'b'),
          text: `<p>Here it is Black's move. The black king is <b>not</b> in check, but every square it could go to is attacked. Black has <b>no legal move</b>: that is <b>stalemate</b>.</p>
            <p>In chess, stalemate is a draw. <b>In Maki, stalemate is a loss</b> for the player who cannot move. So here White has won.</p>`,
        },
        {
          fen: P('Kc5 Nd2 ka6'),
          task: { type: 'stalemate' },
          goal: 'Win by leaving Black without a legal move.',
          text: `<p>The black king can only go to a5. Take that square away, without giving check.</p>`,
          hint: 'Which knight move attacks a5?',
          success: 'Stalemate, and in Maki that wins the game.',
          wrong: 'Black still has a move. Cover a5.',
        },
        {
          fen: P('Kc4 kf6'),
          text: `<p>Two other ways a game can end, both draws:</p>
            <ul><li><b>Repetition:</b> the same position (with the same reserves and the same player to move) appears for the third time.</li>
            <li><b>Bare kings:</b> only the two kings are left and both reserves are empty.</li></ul>
            <p>There is no 50-move rule.</p>`,
        },
      ],
    },

    // --- Playing well -------------------------------------------------------------------------
    {
      id: 'values', chapter: 'play', piece: 'N', title: 'What pieces are worth',
      blurb: 'Rook first, knight before bishop, and why reserve pawns are gold.',
      steps: [
        {
          fen: START,
          text: `<p>Not all pieces are equal. Measured over hundreds of thousands of positions, counting an average pawn on the board as 1:</p>
            <table class="tut-table"><tr><th>Rook</th><td>6¼</td></tr><tr><th>Queen</th><td>5</td></tr><tr><th>Knight</th><td>4¼</td></tr><tr><th>Bishop</th><td>3¾</td></tr><tr><th>Pawn</th><td>1</td></tr></table>
            <p>Unlike chess, the rook is the strongest piece, and the knight is worth more than the bishop because the diagonals are short.</p>`,
        },
        {
          fen: P('Kd1 Pa2 Pb4 Pd6 kf6', 'P'),
          text: `<p>Pawns change value as they advance. A pawn on rank 2 is worth about ¾, but in the enemy half it gains sideways moves: on rank 4 it is worth about 1¾. On the last rank it can only shuffle sideways and is worth little.</p>
            <p>A pawn in your <b>reserve</b> is worth about 1¾ too, because it can be dropped wherever it hurts most. Don't rush to spend it.</p>`,
        },
        {
          fen: P('Kd1 Nc3 kd6 bb5 re4'),
          task: { type: 'moves', moves: ['c3e4'] },
          goal: 'Two black pieces are undefended. Win the more valuable one.',
          text: `<p>Before every move, ask: <b>what can I capture, and what is it worth?</b></p>`,
          hint: 'The rook is worth more than the bishop.',
          success: 'You won a rook, the most valuable piece.',
          wrong: 'There is a bigger prize on the board.',
        },
      ],
    },
    {
      id: 'tactics', chapter: 'play', piece: 'N', title: 'Forks and drop tricks',
      blurb: 'Attack two things at once.',
      steps: [
        {
          fen: P('Ka1 Nc3 kb6 rf6'),
          task: { type: 'moves', moves: ['c3d5'] },
          goal: 'Fork the king and the rook with your knight.',
          text: `<p>A <b>fork</b> is one move that attacks two pieces. If one of them is the king, the opponent must answer the check and loses the other piece.</p>`,
          hint: 'Find the square a knight jump from both b6 and f6.',
          success: 'Check, and the rook falls next move.',
          wrong: 'That does not attack both the king and the rook.',
        },
        {
          fen: P('Ka1 kc6 nf6', 'R'),
          task: { type: 'moves', moves: ['R@e6'] },
          goal: 'Drop the rook to check the king and win the knight.',
          text: `<p>Drops make forks easy to set up: the piece appears exactly where you want it.</p>`,
          hint: 'Drop on the sixth rank, but not next to the king, or it will simply take your rook.',
          success: 'Check, and next move the rook takes the knight.',
          wrong: 'Not quite. Check the king along the sixth rank and hit the knight at the same time, from a square the king cannot reach.',
        },
        {
          fen: P('Kd1 Pa2 Pe2 kf6 nb5 bd5', 'P'),
          task: { type: 'moves', moves: ['P@c5'] },
          goal: 'Win a piece with a pawn drop.',
          text: `<p>You saw this trick in the drops lesson. A pawn dropped into the enemy half attacks both sides at once.</p>`,
          hint: 'Between the two pieces.',
          success: 'The pawn fork again: one of the two black pieces is lost.',
          wrong: 'Look for the drop that attacks both pieces.',
        },
      ],
    },
    {
      id: 'endgames', chapter: 'play', piece: 'B', title: 'Winning the endgame',
      blurb: 'Why a lone bishop or knight still wins in Maki.',
      steps: [
        {
          fen: P('Kc4 Bf2 kc6'),
          text: `<p>In chess, king and bishop against a king is a draw. In Maki a lone bishop or knight can <b>never give checkmate</b> either, but it still <b>wins</b>, because stalemate wins.</p>
            <p>The plan: use your king and piece to take away the black king's squares until it has no move at all, without giving check on the last move.</p>`,
        },
        {
          fen: P('Kc5 Nd2 ka6'),
          arrows: ['d2b3'],
          text: `<p>You already did it once: this is the stalemate win from earlier. With the stronger side to move, king and bishop always win (in at most 20 moves) and king and knight nearly always do.</p>
            <p>To practise, open the <b>Analysis board</b> and choose a <b>Lone-piece ending</b>. It shows the exact result of every move.</p>`,
        },
      ],
    },
    {
      id: 'first-game', chapter: 'play', piece: 'K', title: 'Your first games',
      blurb: 'Simple principles, then play.',
      steps: [
        {
          fen: START,
          text: `<p>A few principles for the start of the game:</p>
            <ul><li><b>Bring out your knights</b> early: they are your best minor pieces and jump over the pawns.</li>
            <li><b>Push pawns into the enemy half.</b> On rank 4 they move sideways too and are worth almost twice as much.</li>
            <li><b>Keep your reserve</b> for the right moment. A drop is most dangerous near the enemy king.</li>
            <li><b>Watch the opponent's reserve.</b> Before every move, ask where a dropped rook, bishop or pawn could hurt you.</li>
            <li><b>Keep your king covered.</b> A king with no friends nearby is easy to mate with drops.</li></ul>`,
        },
        {
          fen: START,
          end: true,
          text: `<p>You know all the rules now. The best way to learn is to play.</p>
            <p>Start against Stockhorse at a low strength, then turn it up as you win. After each game, use <b>Review</b> to see your best moves and your mistakes.</p>`,
        },
      ],
    },
  ];

  const api = { CHAPTERS, LESSONS, P };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TutorialLessons = api;
})(globalThis);
