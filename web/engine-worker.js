'use strict';
// Runs the engine off the page's main thread so the board stays responsive.
//
// Searches (play, analyse, lines) use Stockhorse in WebAssembly with the trained network when
// the site has one (see config.js: SK_NET); otherwise, or if it fails to load, the reference
// engine with G0. The network loads on the first search, so a worker that only probes the
// endgame tables never downloads it.
importScripts('../reference/engine.js', 'endgame.js', 'engine-tasks.js', 'wasm-engine.js', 'config.js');

const SEARCHES = new Set(['play', 'analyse', 'lines']);
let nnue = null; // Promise of a WasmEngine, or of null when the site runs G0

function network() {
  if (nnue) return nnue;
  const cfg = self.MAKI_CONFIG || {};
  if (!cfg.net || !cfg.wasm || typeof WebAssembly !== 'object') return (nnue = Promise.resolve(null));
  nnue = self.WasmEngine.load({ wasm: cfg.wasm, net: cfg.net }).catch(err => {
    console.warn('Stockhorse network unavailable, using G0:', err);
    return null;
  });
  return nnue;
}

const engineInfo = eng => ({ eval: eng ? eng.net : 'G0', wasm: !!eng });

self.onmessage = async e => {
  const { id, cmd, args } = e.data;
  try {
    if (cmd === 'engineInfo') return self.postMessage({ id, result: engineInfo(await network()) });
    const task = self.EngineTasks[cmd];
    if (typeof task !== 'function' || cmd === 'build') throw new Error(`unknown command ${cmd}`);
    const eng = SEARCHES.has(cmd) ? await network() : null;
    const result = eng ? eng[cmd](args) : task(args);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({ id, error: String((err && err.message) || err) });
  }
};
