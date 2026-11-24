#!/usr/bin/env python3
"""Pick variations for each opening seed: where the opponent of the practising side moves in the
first plies, every move within 60 cp of the engine's choice becomes a candidate side line, which
is then extended with 1.5 s searches. Writes tools/train/.openings-lines.json.
  CHILD_DEPTH=-300 python3 tools/train/openings_build.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import openings_explore as X

# (key, practising side, seed moves)
SEEDS = [
    ('lantern', 'w', 'b2b3 d5d4'), ('lighthouse', 'w', 'f2f3 e5e4'), ('gate', 'w', 'c2c3 d5d4'),
    ('pillar', 'w', 'd2d3 a5a4'), ('hopper', 'w', 'e1f3 a5a4'),
    ('edge-raid', 'b', 'b2b3 a5a4'), ('spike', 'b', 'c2c3 a5a4'), ('dusk', 'b', 'f2f3 d5d4'),
    ('night-lantern', 'b', 'd2d3 e5e4'), ('repeller', 'b', 'e1f3 e5e4'), ('crossfire', 'b', 'e1d3 d5d4'),
    ('counterthrust', 'b', 'b1c3 c5c4'), ('rim-punish', 'b', 'a2a3 d5d4'), ('mirror-gate', 'b', 'c2c3 e5e4'),
    ('leap', 'b', 'e2e3 b6c4'), ('corner-trap', 'b', 'b1a3 a5a4'),
]
PLIES = 12
LINES = os.path.join(X.ROOT, 'tools/train/.openings-lines.json')
out = json.load(open(LINES)) if os.path.exists(LINES) else {}
for key, side, seed in SEEDS:
    if key in out: continue
    main = X.extend(seed.split(), PLIES)
    ev = X.white_eval(main)
    vars_ = []
    opp_parity = 1 if side == 'w' else 0   # ply index parity of the opponent's moves
    for ply in range(1, 7):
        if ply % 2 != opp_parity or len(vars_) >= 3: continue
        kids = X.children(main[:ply])
        best = kids[0][1]
        for m, s in kids[:4]:
            if m == main[ply] or s < best - 60 or len(vars_) >= 3: continue
            line = X.extend(main[:ply] + [m], PLIES)
            vars_.append({'branch': ply, 'moves': line, 'eval': X.white_eval(line), 'score': s})
    out[key] = {'side': side, 'main': main, 'eval': ev, 'vars': vars_}
    print(key, ' '.join(main), ev, [(' '.join(v['moves'][v['branch']:v['branch']+2]), v['eval']) for v in vars_], flush=True)
    json.dump(out, open(os.path.join(X.ROOT, 'tools/train/.openings-lines.json'), 'w'), indent=1)
X.pool.shutdown()
