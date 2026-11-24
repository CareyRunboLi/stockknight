'use strict';
// Writes web/train/openings.js: the named Maki openings for the Train section.
//   node tools/train/openings_write.js
//
// The move sequences and evaluations come from tools/train/openings-lines.json, made with
// Stockhorse and the G25 network by openings_build.py (main lines: the engine's move at
// 1.5 s per move; variations: every reply within 60 cp of the engine's choice in a 0.3 s search
// of each legal move, extended the same way) and openings_evals.py (the end of every line
// re-scored with a 3 s search, White's view). The names, summaries, principles and comments
// are written by hand from those lines; this script checks every move in reference/engine.js.
const fs = require('node:fs');
const path = require('node:path');
const SK = require('../../reference/engine.js');

const LINES = require('./openings-lines.json');

// key in openings-lines.json -> text. vars: [index into LINES[key].vars, name, note]
const OPENINGS = [
  {
    key: 'lantern', name: 'Lantern Opening', family: 'White: wing pawn openings',
    summary: '1.b3 lights up the long a1–f6 diagonal for the corner bishop, and f3–f4 follows to break into Black\'s half with a pawn that can capture sideways. Stockhorse\'s favourite first move.',
    principles: [
      'Open the a1 bishop first: after b3 it looks through c3 and d4 at the e5 pawn and Black\'s bishop behind it.',
      'Aim a pawn at the fourth rank with f3–f4. In Black\'s half a pawn also captures left and right, so one pawn attacks two.',
      'Trade on d4 when it removes Black\'s best central pawn, and recapture with the d-pawn so it lands in Black\'s half.',
      'Keep the reserve: neither side drops anything in the first six moves. A drop is strongest once there is a target for it.',
      'After the trades the f4 pawn is loose, and Rxf4 wins it back.',
    ],
    comments: {
      0: 'Opens the a1–f6 diagonal. The bishop now sees c3, d4 and the e5 pawn, and b2 is free for it later.',
      1: 'Blocks the diagonal at once. The pawn on d4 is guarded by the e6 knight, and in Black\'s own half it only moves and captures straight ahead.',
      2: 'Prepares f4, the pawn break of this opening.',
      3: 'Space, and it opens the f6 bishop\'s path to e5 and d4, so d4 now has two defenders.',
      4: 'Pawns in their own half capture straight ahead, so d3 attacks d4 head-on, beside the bishop.',
      5: 'More space. From c4 the pawn controls c3, keeping White\'s knight off its natural square.',
      6: 'The break. On f4 the pawn is in Black\'s half, so it attacks f5 straight ahead and e4 sideways.',
      7: 'Black takes: otherwise White wins a pawn on e4 or f5.',
      8: 'The bishop takes d4 and now hits both the f6 bishop and the b6 knight.',
      9: 'Black trades bishops rather than lose the knight.',
      10: 'The d-pawn recaptures and, standing in Black\'s half, attacks c4 and e4 sideways.',
      11: 'Black wins a pawn back with a central knight. White is a pawn down for a moment, but the f4 pawn is loose: Rxf4 restores the balance, and Stockhorse prefers White.',
    },
    vars: [
      [0, 'Edge Raid Defence', '1...a4 and ...a3 open the a-file against the corner. White takes with the knight and plays f3–f4 just as in the main line. Practise it from Black\'s side as the Edge Raid Defence.'],
      [1, 'Early c-Push', 'With b3 played, the bishop can step to b2. After the f-pawn break, the pawn drop P@f5 attacks the f6 bishop straight ahead.'],
      [2, 'b-Pawn Gambit', 'Throwing the b-pawn at b3 only loses it: 2.bxb4, and later the drop P@d4 hits the d5 knight. White is clearly better.'],
    ],
  },
  {
    key: 'lighthouse', name: 'Lighthouse Opening', family: 'White: wing pawn openings',
    summary: 'The f-pawn goes first and goes far: 1.f3 and 2.f4 strike at once, and a pawn drop on f5 harasses the f6 bishop. Sharp and tactical.',
    principles: [
      'Strike early with f3–f4: the pawn enters Black\'s half and attacks two pawns at once.',
      'A pawn dropped deep in the enemy half is a real attacker: P@f5 hits the f6 bishop straight ahead. You can only drop a pawn on a file with none of your own pawns, so the f-file must be cleared first.',
      'The f1 rook follows the f-pawn: once the file opens, Rxf4 picks up loose pawns.',
      'An enemy pawn on your third rank (…dxd3) can step sideways there, so round it up before it does damage.',
      'Black can equalise with 2...Nxf4. Know that line before you play the Lighthouse.',
    ],
    comments: {
      0: 'Prepares f4 at once, on the opposite wing from the Lantern.',
      1: 'Black grabs space. On e4 the pawn is still in Black\'s half, so it moves only straight ahead.',
      2: 'The break: from f4 the pawn attacks f5, and e4 sideways.',
      3: 'The natural capture. 2...Nxf4 is an equal alternative (see the variations).',
      4: 'A quiet pawn move that frees d2 for the king and queen.',
      5: 'Black\'s d-pawn now attacks d3 head-on.',
      6: 'The first drop of the game: a pawn on f5 attacks the f6 bishop. It is allowed because White has no pawn left on the f-file.',
      7: 'Black counterattacks instead of saving the bishop. The pawn takes d3 and, now in White\'s half, can also move sideways.',
      8: 'White collects the bishop. From f6, Black\'s back rank, the pawn can only move sideways, and it attacks the e6 knight.',
      9: 'The knight leaves the attack for a central square, hitting c2 and e2.',
      10: 'The rook takes the f4 pawn and eyes e4.',
      11: 'Black drops the reserve rook on e3, attacking e2: a heavy piece placed straight into White\'s camp. White is a bishop up for a pawn and Stockhorse prefers White, but Black\'s pieces are very active.',
    },
    vars: [
      [0, 'Knight Grab', '2...Nxf4 takes the pawn with the knight. After 3.c3 d4 4.Rxf4 fxf4, Black has the bishop pair and is fine: about level.'],
      [1, 'Slow a-Pawn', '3...a4 lets White win the bishop with P@f5 and fxf6, and White keeps an edge.'],
      [2, 'c-Pawn Counter', '3...c4 is Black\'s sharpest reply: after P@f5 Nc5 Black ignores the bishop and races on the queenside. Stockhorse rates it fine for Black at this depth.'],
    ],
  },
  {
    key: 'gate', name: 'Gate Opening', family: 'White: quiet openings',
    summary: 'Solid and patient: 1.c3 and Nc2, with pawns on c3, e3 and f3 forming a gate in front of White\'s pieces. Few early tactics and a level game.',
    principles: [
      'Pawns in your own half capture only straight ahead, so they never defend each other. The gate is held by the pieces behind it: the c2 knight and the king on e2.',
      'Answer ...d4 with Nc2, which attacks the pawn and frees e1 for the rook.',
      'The king steps like a queen and is a useful defender in the middle of the board: on e2 it guards d3, e3 and f3.',
      'In a quiet position, keep the whole reserve. Neither side drops anything in the main line.',
      'Watch the corner: ...a4–a3 and a pawn drop on a2 aim at your a1 bishop (see Corner Siege).',
    ],
    comments: {
      0: 'A modest move. It frees c2 for the e1 knight, and the pawn controls c4.',
      1: 'Black takes central space; d4 is guarded by the e6 knight.',
      2: 'The knight comes to c2 and attacks d4.',
      3: 'Black\'s other knight jumps to d5, where it eyes c3.',
      4: 'Frees e2 for the king, and the pawn controls e4.',
      5: 'The rook slides behind the b-pawn to support ...b4.',
      6: 'Another solid step; every White piece now sits behind a wall of pawns.',
      7: 'The b-pawn advances with the rook behind it.',
      8: 'The king steps up to guard d3, e3 and f3.',
      9: 'More queenside space for Black.',
      10: 'The rook takes the e-file behind the e-pawn.',
      11: 'Black\'s f-pawn now attacks f3. Both reserves are untouched and the game is level.',
    },
    vars: [
      [0, 'Mirror Gate', '1...e4 is Black\'s best try: the a-pawn rush and a pawn drop on a2 win the a1 bishop. Practise it from Black\'s side as the Mirror Gate.'],
      [1, 'Corner Siege', '1...a4 and ...a3: Black gives a rook for the c2 knight, then drops a bishop on a2 and a pawn on c3. Practise it from Black\'s side as the Corner Siege.'],
      [2, 'Twin Pawn Centre', 'After 2...e4, the rook on e1 and e3 challenge the pawn, and White is better.'],
    ],
  },
  {
    key: 'pillar', name: 'Pillar Opening', family: 'White: quiet openings',
    summary: '1.d3 opens d2 for the king and queen, invites Black\'s a-pawn rush, and meets it calmly with b3 and axa3. White then targets Black\'s overextended pawns.',
    principles: [
      'Meet the a-pawn rush with b3 and take on a3 with the a-pawn. The a-file opens for Black\'s rook, but Black has spent three moves getting there.',
      'A dropped pawn on a2 is annoying but not fatal. Develop and counterattack (Nd2 hits c4) instead of panicking.',
      'Advanced pawns cannot be defended by other pawns, because pawns never capture diagonally. Black\'s pawn on c4 has to be held by pieces.',
      'The king and queen both step one square in any direction, so d3 opens the same square, d2, for both of them.',
    ],
    comments: {
      0: 'Opens d2 for the king and queen and controls d4.',
      1: 'Black starts the a-pawn rush.',
      2: 'Opens the bishop\'s diagonal and gives the bishop b2.',
      3: 'Now in White\'s half, the pawn attacks a2 straight ahead and b3 sideways.',
      4: 'The a-pawn removes the intruder.',
      5: 'Space on the queenside.',
      6: 'Prepares f4, as in the Lantern.',
      7: 'The key Maki idea: a pawn dropped on a2 attacks the a1 bishop, because a pawn may capture straight ahead onto the back rank. The drop is legal because Black has no pawn left on the a-file.',
      8: 'White develops and attacks c4 instead of spending a move on the bishop.',
      9: 'The rook takes the a3 pawn and attacks b3.',
      10: 'A second attack on c4.',
      11: 'Black grabs central space. Stockhorse rates White better: Black\'s pieces are tied to the a-file while White\'s centre is whole.',
    },
    vars: [
      [0, 'Night Lantern', '1...e4 is the most solid answer. The f6 bishop comes to e5, and the a-pawn and a drop on a2 follow. It is about level. Practise it from Black\'s side as the Night Lantern.'],
      [1, 'Delayed Raid', 'Black pushes ...c4 before ...a3. After the pawn drop on a2, White breaks with f4 and drops a pawn on f5.'],
      [2, 'Early Drop', 'An immediate 3...P@a2 is met by 4.Bc3, saving the bishop, and White is clearly better.'],
    ],
  },
  {
    key: 'hopper', name: 'Hopper Opening', family: 'White: knight openings',
    summary: 'An offbeat knight jump: 1.Nf3 attacks e5 at once. Against the natural a-pawn rush White collects pawns, but the reply 1...e4 makes it a doubtful choice.',
    principles: [
      'An early knight move blocks a pawn and becomes a target: a pawn that reaches it with tempo pushes it back. Against 1.Nf3, 1...e4 does exactly that.',
      'Material is not everything in Maki. In the main line White wins three pawns, but White\'s remaining pawns sit on the second rank, where a pawn is worth least, while Black\'s c4 and d4 pawns are advanced and Black\'s pieces are active.',
      'The b3–Bb2 battery against e5 is a recurring idea: knight and bishop hit the pawn together.',
      'If you play the Hopper, have an answer ready for 1...e4. Better still, learn the Lantern.',
    ],
    comments: {
      0: 'The knight attacks e5 from f3. It also blocks White\'s own f-pawn.',
      1: 'Black starts the a-pawn rush instead of defending.',
      2: 'Opens the diagonal so the bishop can join the attack on e5.',
      3: 'The pawn attacks a2 straight ahead and b3 sideways.',
      4: 'The b1 knight takes it and now eyes b5.',
      5: 'Space on the queenside.',
      6: 'The bishop uses b2, and with the knight it attacks e5 twice.',
      7: 'Black gives up e5 and brings the queen toward the queenside.',
      8: 'The bishop wins e5 and now hits f6.',
      9: 'The f-pawn attacks the f3 knight.',
      10: 'The bishop takes that pawn too.',
      11: 'Black has given three pawns for activity. Stockhorse calls it about level.',
    },
    vars: [
      [0, 'Repeller Defence', 'The refutation: 1...e4 attacks nothing yet but takes away e5, and the a-pawn rush with a drop on a2 wins the a1 bishop. Black is clearly better. Practise it from Black\'s side as the Repeller Defence.'],
      [1, 'Knight Swap', '1...c4 2.b3 a4 3.Bb2 Nc5: Black\'s knight trades itself for the b2 bishop, and Black is slightly better.'],
    ],
  },
  {
    key: 'edge-raid', name: 'Edge Raid Defence', family: 'Black: against 1.b3',
    summary: 'Against the Lantern, Black rushes the a-pawn to a3 to open the a-file and attack White\'s queenside. It is riskier than the main line 1...d4, but White has to know what to do.',
    principles: [
      'In White\'s half a Black pawn captures sideways too: on a3 it attacks both a2 and b3.',
      'Give the pawn to open lines: after Nxa3 the a-file and the a6 rook are both alive.',
      'A pawn on d4 blocks the a1 bishop, but expect Bxd4 once White\'s f-pawn arrives.',
      'If White takes on a3 with the a-pawn, a pawn drop on a2 hits the a1 bishop (see the variations).',
    ],
    comments: {
      0: 'The Lantern: White opens the a1 bishop.',
      1: 'The raid begins.',
      2: 'White carries on with the plan, ignoring the a-pawn.',
      3: 'Now in White\'s half, the pawn attacks a2 straight ahead and b3 sideways.',
      4: 'The knight takes, and now it eyes b5.',
      5: 'Blocks the diagonal, guarded by the e6 knight.',
      6: 'The f-pawn break, attacking f5.',
      7: 'Black takes the pawn.',
      8: 'The bishop wins d4 and now hits c5 and e5.',
      9: 'The knight comes to the centre and covers the long diagonal.',
      10: 'White adds a pawn to the centre.',
      11: 'Black keeps the e-pawn out of the bishop\'s reach. White is better: Black has lost two pawns to White\'s one.',
    },
    vars: [
      [0, 'Pawn Recapture', 'If White takes on a3 with the a-pawn, the drop P@a2 hits the a1 bishop at once. White hits back with f4 and its own drop on f5.'],
      [2, 'Slow d3', '4.d3 instead of f4 lets Black hit back with ...e4, ...dxd3 and ...e3. The game is close to level.'],
    ],
  },
  {
    key: 'spike', name: 'Corner Siege', family: 'Black: against 1.c3',
    summary: 'Against the Gate, Black storms the a1 corner. The a-pawn reaches a3, the rook takes a knight there, and a dropped bishop on a2 and a dropped pawn on c3 tie White up. About level.',
    principles: [
      'Material can be traded for drops: after ...Rxa3 axa3, Black\'s rook is gone, so the reserve bishop may be dropped (fewer than two rooks and bishops on the board).',
      'A bishop dropped on a2 sits behind White\'s lines, where pawns cannot attack it diagonally.',
      'Use pawn drops as attackers: P@c3 hits the c2 knight straight ahead.',
      'Keep the c6 king safe. With White\'s rook and bishop still in reserve, Black must watch for drops near the king.',
    ],
    comments: {
      0: 'The Gate: c2 is free for the knight.',
      1: 'The siege begins on the a-file.',
      2: 'The knight comes to c2, as in the Gate.',
      3: 'The pawn attacks a2 straight ahead.',
      4: 'The b1 knight takes the pawn.',
      5: 'The exchange sacrifice: the rook takes the knight and attacks c3 and a2.',
      6: 'White wins the rook for a knight.',
      7: 'Now Black may drop the reserve bishop. On a2 it stands deep in White\'s camp, out of reach of pawns.',
      8: 'The rook steps to e1, the square the knight left.',
      9: 'The c-pawn attacks c3 head-on.',
      10: 'White takes it.',
      11: 'A pawn drop on c3 attacks the c2 knight. Black has given the exchange for very active drops, and Stockhorse calls it level.',
    },
    vars: [
      [0, 'b3 Line', 'Against 2.b3, the same rook sacrifice on a3 is followed by ...e4 and a knight on d4. Level.'],
      [1, 'Quiet f3', 'After 2.f3 e4 3.b3 c4, Black takes on c3, the bishops come off and the game is level.'],
      [2, 'Pawn Takes', 'If White takes 3.axa3 with the pawn, Black plays ...e4 and ...Nd4, and drops a pawn on a4 later. Slightly better for White.'],
    ],
  },
  {
    key: 'mirror-gate', name: 'Mirror Gate', family: 'Black: against 1.c3',
    summary: 'Black\'s best answer to the Gate. 1...e4 takes space, and then the a-pawn and a pawn drop on a2 win White\'s a1 bishop for two pawns.',
    principles: [
      'Target the corner bishop: after ...a3 and axa3, a pawn dropped on a2 attacks a1.',
      'A pawn on the back rank only moves sideways. Black\'s pawn on a1 then attacks the b1 knight.',
      'Trade pawns for a piece: Black gives up the a- and c-pawns, and wins a bishop.',
      'Black\'s e4 pawn keeps e3 under fire, and the c2 knight has fewer squares.',
    ],
    comments: {
      0: 'The Gate.',
      1: 'Space in the centre. The pawn attacks e3.',
      2: 'The knight comes to c2.',
      3: 'The raid starts.',
      4: 'White\'s e-pawn now attacks e4 head-on.',
      5: 'The pawn reaches a3 and attacks a2.',
      6: 'White takes it with the a-pawn.',
      7: 'The c-pawn attacks c3 head-on.',
      8: 'This opens the bishop\'s diagonal and gives it b2.',
      9: 'The drop: a pawn on a2 attacks the a1 bishop.',
      10: 'White takes the c-pawn instead of saving the bishop.',
      11: 'Black wins the bishop for two pawns. The pawn on a1 attacks the b1 knight sideways. Black is better.',
    },
    vars: [
      [0, 'Knight Raid', 'Against 2.b3, the knight goes ...Nd4, ...Nxb3 and ...Nxa1 to win the bishop instead. About level.'],
      [1, 'e3 Counter', 'After 2.e3 c4 3.exe4, White wins the e-pawn and the game turns sharp. Slightly better for White.'],
      [2, 'f3 System', 'Against 2.f3, Black plays ...a4, ...c4 and ...cxc3, the bishops come off and it is level.'],
    ],
  },
  {
    key: 'night-lantern', name: 'Night Lantern', family: 'Black: against 1.d3',
    summary: 'Black\'s mirror of the Lantern against 1.d3. 1...e4 frees the f6 bishop, which comes to e5 to aim at b2, and the a-pawn rush follows. Level to slightly better for Black.',
    principles: [
      'Lighting your own long diagonal works for Black too: ...e4 and ...Be5 aim the bishop at b2 and the a1 corner.',
      'Combine the diagonal with the a-pawn: after ...a3 axa3, the drop P@a2 attacks a1 and b2 together.',
      'Look for ...Bxc3 when White\'s c-pawn steps into the diagonal.',
      'Against 2.Nf3 the game turns into the Repeller Defence, which is even better for Black.',
    ],
    comments: {
      0: 'The Pillar.',
      1: 'Space, and the f6 bishop\'s diagonal opens.',
      2: 'Prepares f4 against the e4 pawn.',
      3: 'The bishop comes to e5 and attacks b2.',
      4: 'Blocks the diagonal with a pawn.',
      5: 'The a-pawn rush.',
      6: 'The knight develops to c2.',
      7: 'The pawn attacks a2.',
      8: 'White takes it.',
      9: 'The drop: a pawn on a2 attacks both the a1 bishop and the b2 pawn.',
      10: 'The knight develops toward e4.',
      11: 'The bishop takes c3 and attacks d2 and b2. Black is a little better.',
    },
    vars: [
      [0, 'c3 and b3', 'After 2.c3 a4 3.b3 a3 4.axa3 P@a2, White breaks with b4. Black is better.'],
      [1, 'Knight Grab', '2.Nd2 wins the e4 pawn, but Black\'s a-pawn reaches a2 and Black is clearly better.'],
      [2, 'Into the Repeller', '2.Nf3 a4 transposes to the Repeller Defence, and Black wins the a1 bishop.'],
    ],
  },
  {
    key: 'repeller', name: 'Repeller Defence', family: 'Black: against 1.Nf3',
    summary: 'The answer to the Hopper. 1...e4 takes e5 away from the knight and opens the f6 bishop, and the a-pawn rush with a drop on a2 wins White\'s a1 bishop. Clearly better for Black.',
    principles: [
      'When a knight attacks a pawn, moving the pawn forward can be the best defence: on e4 it is out of reach and gains space.',
      'The a-pawn rush plus a drop on a2 is the standard way to attack a1 once White\'s a-pawn has been drawn to a3.',
      'A pawn that reaches a1 can only move sideways, but it attacks the b1 knight there.',
      'Use the f6 bishop on the long diagonal: ...Bxc3 removes the knight that defends the queenside.',
    ],
    comments: {
      0: 'The Hopper: the knight attacks e5.',
      1: 'The pawn steps out of the attack, gains space and opens the f6 bishop.',
      2: 'White frees d2.',
      3: 'The a-pawn rush.',
      4: 'The rook steps to e1, behind the e-pawn.',
      5: 'The pawn attacks a2.',
      6: 'White takes it.',
      7: 'The drop on a2 attacks the a1 bishop and the b2 pawn.',
      8: 'White\'s e-pawn attacks e4.',
      9: 'Black wins the bishop, and the pawn now attacks the b1 knight.',
      10: 'The knight escapes to c3, where it attacks b5, d5 and e4.',
      11: 'The f6 bishop takes it and hits e1 and b2. Black is clearly better.',
    },
    vars: [
      [0, 'c3 Line', 'Against 2.c3 a4 3.b3, Black gives the rook on a3 for the knight, and the drop on a2 follows. Clearly better for Black.'],
      [1, 'Central Trade', 'After 3.c3 d4 4.dxd4 Bxd4, the bishop is active and Black\'s a-pawn keeps marching.'],
      [2, 'Nbd2 Line', '3.Nbd2 d4 4.Nxe4 dxd3 5.Nxf6: White wins the bishop, but Black\'s pawns flood White\'s half.'],
    ],
  },
  {
    key: 'crossfire', name: 'Crossfire Defence', family: 'Black: against 1.Nd3',
    summary: 'Against 1.Nd3, the d-pawn attacks the knight at once and drives it back. Then the d-pawn and the f6 bishop catch c3 in a crossfire. Clearly better for Black.',
    principles: [
      'Gain time on early knights: 1...d4 attacks the d3 knight straight ahead, and it has to go back.',
      'A pawn that steps into the enemy half gains sideways captures: ...d3 attacks d2 and c3 together.',
      'Open the long diagonal with ...e4 before cashing in with ...Bxc3.',
    ],
    comments: {
      0: 'The knight attacks c5 and e5, but it stands in front of the d-pawn.',
      1: 'The d-pawn attacks the knight straight ahead.',
      2: 'The knight has to go back.',
      3: 'Opens the f6 bishop\'s diagonal.',
      4: 'White blocks the diagonal.',
      5: 'The knight comes to d5 and eyes c3.',
      6: 'The knight attacks d4.',
      7: 'The pawn steps into White\'s half, attacking d2 straight ahead and c3 sideways.',
      8: 'White takes it.',
      9: 'The bishop takes c3 and attacks b2.',
      10: 'The rook comes to e1.',
      11: 'Black adds the c-pawn. Black is clearly better: White has wasted two knight moves.',
    },
    vars: [
      [0, 'f3 Line', 'After 3.f3 Nd5 4.b3 Rb6, Black pushes ...b4 and, when White breaks with f4, the knight takes on f4.'],
      [1, 'Late f3', '4.f3 d3 5.Nxd3 Bxc3 is the same crossfire, and Black is even better.'],
    ],
  },
  {
    key: 'counterthrust', name: 'Counterthrust', family: 'Black: against 1.Nc3',
    summary: 'Against 1.Nc3, the c-pawn attacks the knight at once and sends it home. Black gains time for ...e4, ...a4 and ...d4. Clearly better for Black.',
    principles: [
      'Answer a knight on your opponent\'s third rank with the pawn in front of it: 1...c4 attacks c3 straight ahead.',
      'Every tempo spent retreating a knight is a free pawn move for you. Use them to take space with ...e4, ...a4 and ...d4.',
      'When White breaks with f4, take with the f-pawn, as in the Lantern lines.',
    ],
    comments: {
      0: 'The knight attacks b5 and d5, but it blocks the c-pawn.',
      1: 'The c-pawn attacks the knight.',
      2: 'Back home: White has lost two moves.',
      3: 'Space in the centre, and the f6 bishop\'s diagonal opens.',
      4: 'Prepares f4.',
      5: 'The a-pawn joins in.',
      6: 'The break attacks f5, and e4 sideways.',
      7: 'Black takes.',
      8: 'White supports the centre.',
      9: 'The d-pawn attacks d3 head-on.',
      10: 'White opens the a1 bishop.',
      11: 'The knight comes to d5. Black is clearly better.',
    },
    vars: [
      [0, 'Knight Again', 'If White plays 3.d3, 4.f3 and 5.Nd2, Black\'s bishop comes to e5 and the a-pawn takes on a2. Clearly better for Black.'],
    ],
  },
  {
    key: 'rim-punish', name: 'Rim Punisher', family: 'Black: against 1.a3',
    summary: 'Against 1.a3, Black takes the centre with ...d4, and the a-pawn attacks a3 head-on. White\'s queenside falls apart. Clearly better for Black.',
    principles: [
      '1.a3 does nothing for the pieces. Answer it in the centre with ...d4.',
      'A pawn that has already advanced is a target: ...a4 attacks a3 straight ahead.',
      'When pawns come off, follow up with the knights: ...Nxd4 hits c2, e2 and b3 at once.',
    ],
    comments: {
      0: 'A slow edge move.',
      1: 'Black takes the centre.',
      2: 'Prepares f4.',
      3: 'The a-pawn attacks a3.',
      4: 'The break attacks f5.',
      5: 'Black takes.',
      6: 'White opens the bishop.',
      7: 'Black takes a3 and, now in White\'s half, the pawn attacks b3 sideways.',
      8: 'The bishop takes d4.',
      9: 'The knight recaptures and hits c2, e2 and b3.',
      10: 'The rook takes the f4 pawn and attacks the bishop and the knight.',
      11: 'The knight retreats and attacks the rook. Black has won a bishop and is clearly better, though White still has a bishop in reserve.',
    },
    vars: [
      [1, 'd3 Line', 'After 2.d3 dxd3 3.b3 a4, Black opens the a-file and a rook fight follows. Clearly better for Black.'],
      [2, 'c3 Line', 'After 2.c3 a4 3.Nc2 axa3, the a-file opens, and a bishop drop on a4 gives check. Black is winning.'],
    ],
  },
  {
    key: 'leap', name: 'Knight\'s Leap', family: 'Black: against 1.e3',
    summary: 'Against 1.e3, the knight leaps to c4 and wins the e3 pawn with check. A lesson in Maki pawns: in their own half they cannot protect each other.',
    principles: [
      'Pawns in their own half capture only straight ahead, so no pawn can defend another pawn there. A pawn on e3 is defended only by pieces.',
      'Knight jumps that hit undefended pawns, especially with check, gain both material and time.',
      'Support an advanced knight with a pawn: ...e4 guards e3 straight ahead.',
      'Once White\'s king steps out to e2, pawn moves like ...exe3+ come with check.',
    ],
    comments: {
      0: 'Moves the e-pawn into a square no pawn can protect.',
      1: 'The knight attacks e3, d2 and b2.',
      2: 'White cannot defend e3 with a pawn.',
      3: 'The knight takes with check against the king on d1.',
      4: 'The king steps up and attacks the knight.',
      5: 'The pawn guards the knight from e4.',
      6: 'White frees c2 for the knight.',
      7: 'The bishop takes c3 and attacks d2 and b2.',
      8: 'The knight attacks e3.',
      9: 'Black adds the c-pawn.',
      10: 'White takes the knight.',
      11: 'The pawn takes back with check. Black is two pawns up and clearly better.',
    },
    vars: [
      [0, 'd3 Line', 'After 2.d3 Nxe3+ 3.Ke2 e4, Black keeps the extra pawn with ...d4. Black is winning.'],
      [1, 'Knight Defence', 'After 2.Nd3 Nxe3+ 3.Ke2 e4, the knights fork their way in with ...Nd4+ and ...Ndxc2.'],
    ],
  },
  {
    key: 'corner-trap', name: 'Corner Trap', family: 'Black: against 1.Na3',
    summary: 'Against 1.Na3, the a-pawn attacks the knight on the rim, and the f6 bishop on the long diagonal ends up winning the a1 bishop. Clearly better for Black.',
    principles: [
      'A knight on the rim is easy to hit: 1...a4 attacks a3 at once.',
      'The f6 bishop and the a1 bishop share a diagonal. When White\'s b-pawn moves, ...Bxa1 can come.',
      'Use the tempo from chasing a knight to grab space with ...e4.',
    ],
    comments: {
      0: 'The knight goes to the rim and attacks b5.',
      1: 'The a-pawn attacks the knight.',
      2: 'Back home.',
      3: 'Space, and the f6 bishop\'s diagonal opens.',
      4: 'Prepares f4.',
      5: 'The pawn attacks a2.',
      6: 'White takes it.',
      7: 'The bishop comes to e5 and attacks b2.',
      8: 'The break attacks f5, and e4 sideways.',
      9: 'The knight takes and attacks e2.',
      10: 'This opens the diagonal for White\'s bishop, but also for Black\'s.',
      11: 'Black wins the a1 bishop. Black is clearly better.',
    },
    vars: [
      [0, 'Knight Recapture', 'After 4.Nxa3 c4 5.f4 fxf4, the e5 bishop pins down White\'s queenside, and Black is clearly better.'],
    ],
  },
];

const PRINCIPLES = [
  { title: 'Pawns never defend pawns at home', text: 'In your own half a pawn moves and captures only straight ahead, so it can never guard the pawn beside it. Pieces have to defend your pawns. 1.e3 Nc4! shows what goes wrong.' },
  { title: 'Get a pawn to the fourth rank', text: 'In the enemy half a pawn also moves and captures sideways, so one pawn attacks two or three squares. Measured with the engine, a pawn on its fourth rank is worth more than twice one on its second rank. Breaks like f3–f4 (or ...d5–d4–d3 for Black) are the heart of most openings.' },
  { title: 'Open the corner bishop', text: 'Each side starts with a bishop in the corner (a1 and f6), facing the other down the long diagonal. b3 (or ...e4) opens it, and the bishop trade on d4 is a common way to release the tension.' },
  { title: 'Guard the corner', text: 'The same corner bishop is a target. The a-pawn rush (...a4–a3) and a pawn drop on a2 attack a1, and a pawn may capture straight ahead onto the back rank. Keep b2 free for the bishop to escape, or keep the a-pawn at home.' },
  { title: 'Save your drops', text: 'A pawn in reserve is worth more than one on the board, and a reserve rook or bishop is a threat that can land anywhere. In Stockhorse\'s main lines most drops wait until move four or later, when there is a concrete target: a piece to attack, a check, or a hole in the camp.' },
  { title: 'Make room before you drop a rook or bishop', text: 'You may drop a rook or bishop only while you have fewer than two rooks and bishops on the board. Trading or giving up one of them (as in the Corner Siege) frees your reserve piece.' },
  { title: 'Pawn drops need an empty file', text: 'You cannot drop a pawn on a file that already has one of your own pawns. Once your a- or f-pawn has been traded, a drop on a2, f5 and so on becomes possible. Plan pawn trades with that in mind.' },
  { title: 'Knights early are targets', text: 'A knight on its third rank stands in front of an enemy pawn that can march up and hit it. 1.Nc3 c4!, 1.Nd3 d4! and 1.Na3 a4! all win time. Move pawns first and bring the knights out once the pawns have fixed the centre.' },
  { title: 'The queen is a small piece', text: 'The queen only steps one square, like a king. Measured with the engine it is worth about 5 pawns, not much more than a knight (about 4.25). Use it as a defender near your king (Qc2, Qd2) rather than an attacker.' },
  { title: 'Your king can help', text: 'Kings attack the squares around them, so the two kings never stand side by side. A king on e2 or d2 is a useful defender of your third-rank pawns, as in the Gate.' },
  { title: 'Count the whole position', text: 'Material on the board can mislead. Pawns on their second rank are worth little, reserve pieces are worth a lot, and activity matters. Stockhorse often gives up the exchange or pawns for strong drops.' },
];

// --- checks and output -------------------------------------------------------------------

const fmt = cp => { const v = Math.round(cp / 10) / 10; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1); };
function check(moves, what) {
  const pos = new SK.Position();
  moves.forEach((u, i) => {
    const m = pos.moveFromUci(u);
    if (!m) throw new Error(`${what}: illegal ${u} at ply ${i}`);
    pos.makeMove(m);
  });
  return pos;
}
const seen = new Set();
const out = OPENINGS.map((o, i) => {
  const L = LINES[o.key];
  if (!L) throw new Error(`no lines for ${o.key}`);
  const end = check(L.main, o.name);
  const key = end.fen().split(' ').slice(0, 2).join(' ');
  if (seen.has(key)) throw new Error(`${o.name}: same final position as another opening`);
  seen.add(key);
  for (const ply of Object.keys(o.comments)) if (+ply >= L.main.length) throw new Error(`${o.name}: comment past the line`);
  const variations = o.vars.map(([vi, name, note]) => {
    const v = L.vars[vi];
    check(v.moves, `${o.name} / ${name}`);
    return { name, moves: v.moves, note, eval: fmt(v.eval3 ?? v.eval) };
  });
  return {
    id: `o${String(i + 1).padStart(2, '0')}`,
    name: o.name, family: o.family, side: L.side, moves: L.main,
    summary: o.summary, principles: o.principles,
    comments: Object.fromEntries(Object.entries(o.comments).map(([k, v]) => [String(k), v])),
    variations, eval: fmt(L.eval3 ?? L.eval),
  };
});

const header = `'use strict';
// Named Maki openings for the Train section, written by tools/train/openings_write.js from lines
// chosen with Stockhorse and the G25 network (tools/train/openings_build.py). Evaluations are
// White's view in pawns, from a 3 s search at the end of each line. Do not edit by hand.
(function (root) {
`;
const body = `  const DATA = [\n${out.map(o => `    ${JSON.stringify(o)},`).join('\n')}\n  ];\n` +
  `  const PRINCIPLES = [\n${PRINCIPLES.map(p => `    ${JSON.stringify(p)},`).join('\n')}\n  ];\n`;
const footer = `  if (typeof module !== 'undefined' && module.exports) module.exports = { openings: DATA, principles: PRINCIPLES };
  else {
    root.TrainData = root.TrainData || {};
    root.TrainData.openings = DATA;
    root.TrainData.openingPrinciples = PRINCIPLES;
  }
})(typeof self !== 'undefined' ? self : this);
`;
const file = path.join(__dirname, '../../web/train/openings.js');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, header + body + footer);
console.log(`${file}: ${out.length} openings, ${out.reduce((n, o) => n + o.variations.length, 0)} variations, ${PRINCIPLES.length} principles`);
