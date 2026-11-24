#!/usr/bin/env python3
"""Re-score the end of every chosen opening line with a 3 s search (White's view, centipawns)
and store it as eval3 in tools/train/openings-lines.json.
  python3 tools/train/openings_evals.py
"""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import openings_explore as X
P = os.path.join(X.ROOT, 'tools/train/openings-lines.json')
d = json.load(open(P))
lines = [v for v in d.values()] + [x for v in d.values() for x in v['vars']]
def score(v):
    v['eval3'] = X.white_eval(v.get('main') or v['moves'], -3000)
list(X.pool.map(score, lines))
json.dump(d, open(P, 'w'), indent=1)
X.save(); X.pool.shutdown()
