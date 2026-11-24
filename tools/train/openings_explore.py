#!/usr/bin/env python3
"""Explore the Maki opening tree with Stockhorse (G25) to pick opening lines for the Train section.

Usage (from the repo root, after `cargo build --release --offline`):
  python3 tools/train/openings_explore.py children "b2b3 c5c4"      # score every legal move here
  python3 tools/train/openings_explore.py extend "b2b3 c5c4" 10      # extend with best moves to 10 plies
  python3 tools/train/openings_explore.py eval "b2b3 c5c4 ..."       # score a finished line

Search budget: each child position is searched to a fixed depth (default 10, ~0.2-0.5 s each at
~1.5M nodes/s); lines are extended with 1.5 s searches (LINE_MS). Two engine processes run in parallel.
Results are cached in tools/train/.openings-cache.json (not needed in the repo).
Moves whose score is within 50 cp of the best are treated as playable alternatives.
"""
import json, os, subprocess, sys, threading
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENGINE = os.path.join(ROOT, 'target/release/stockknight')
NET = os.environ.get('MAKI_NET', '/mnt/project-files/stockknight/nets/g25.nnue')
CACHE = os.path.join(ROOT, 'tools/train/.openings-cache.json')
CHILD_DEPTH = int(os.environ.get('CHILD_DEPTH', 10))
LINE_MS = int(os.environ.get('LINE_MS', 1500))

class Engine:
    def __init__(self):
        self.p = subprocess.Popen([ENGINE], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
        self.send(f'setoption name EvalFile value {NET}')
        self.send('isready'); self.wait('readyok')
    def send(self, s): self.p.stdin.write(s + '\n'); self.p.stdin.flush()
    def wait(self, prefix):
        while True:
            l = self.p.stdout.readline()
            if not l: raise RuntimeError('engine died')
            if l.startswith(prefix): return l.strip()
    def pos(self, moves):
        self.send('position startpos' + (' moves ' + ' '.join(moves) if moves else ''))
    def legal(self, moves):
        self.pos(moves); self.send('legal'); self.send('isready')
        out = []
        while True:
            l = self.p.stdout.readline().strip()
            if l == 'readyok': return out
            out = l.split()
    def search(self, moves, depth):
        # depth > 0: fixed depth; depth < 0: -depth milliseconds
        self.pos(moves); self.send('ucinewgame')
        self.send(f'go depth {depth}' if depth > 0 else f'go movetime {-depth}')
        last = None
        while True:
            l = self.p.stdout.readline()
            if l.startswith('info') and ' score ' in l: last = l
            if l.startswith('bestmove'):
                best = l.split()[1]
                break
        w = last.split()
        i = w.index('score')
        kind, val = w[i + 1], int(w[i + 2])
        score = val if kind == 'cp' else (30000 - abs(val)) * (1 if val > 0 else -1)
        pv = w[w.index('pv') + 1:] if 'pv' in w else []
        return score, best, pv   # side to move's view

_cache = json.load(open(CACHE)) if os.path.exists(CACHE) else {}
_lock = threading.Lock()
def save():
    with _lock: json.dump(_cache, open(CACHE, 'w'))

_local = threading.local()
def eng():
    if not hasattr(_local, 'e'): _local.e = Engine()
    return _local.e

def search(moves, depth):
    key = f"{' '.join(moves)}|{depth}"
    if key in _cache: return _cache[key]
    r = eng().search(moves, depth)
    with _lock: _cache[key] = r
    return r

pool = ThreadPoolExecutor(2)

def children(moves, depth=CHILD_DEPTH):
    # CHILD_DEPTH < 0 means -ms per child
    """Every legal move, scored from the mover's view, best first."""
    legal = eng().legal(moves)
    res = list(pool.map(lambda m: (m, -search(moves + [m], depth)[0]), legal))
    save()
    return sorted(res, key=lambda x: -x[1])

def extend(moves, plies, depth=-LINE_MS):
    moves = list(moves)
    while len(moves) < plies:
        s, best, pv = search(moves, depth)
        moves.append(best)
    save()
    return moves

def white_eval(moves, depth=-LINE_MS):
    s = search(moves, depth)[0]
    save()
    return s if len(moves) % 2 == 0 else -s

if __name__ == '__main__':
    cmd = sys.argv[1]
    mv = sys.argv[2].split() if len(sys.argv) > 2 else []
    if cmd == 'children':
        for m, s in children(mv): print(f'{m:6} {s:+6}')
    elif cmd == 'extend':
        line = extend(mv, int(sys.argv[3]))
        print(' '.join(line), white_eval(line))
    elif cmd == 'eval':
        print(white_eval(mv), search(mv, -LINE_MS)[2])
    pool.shutdown()
