'use strict';
// Stockhorse in WebAssembly: the Rust search (crates/wasm) with a trained network. Loaded by
// the engine worker; also works in Node (for tests and calibration). The tasks take and return
// the same shapes as play, analyse and lines in engine-tasks.js.
//
//   const eng = await WasmEngine.load({ wasm: bytesOrUrl, net: bytesOrUrl /* optional */ });
//   eng.play({ fen, moves, elo }); eng.analyse({...}); eng.lines({...}); eng.info();

(function (root) {
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // The few WASI calls Rust's standard library makes: clocks, random bytes, writing panics to
  // the console. Anything else answers "not supported".
  function wasi(getMemory) {
    const view = () => new DataView(getMemory().buffer);
    const ENOSYS = 52;
    const fns = {
      clock_time_get(_id, _precision, out) {
        view().setBigUint64(out, BigInt(Math.round(now() * 1e6)), true);
        return 0;
      },
      clock_res_get(_id, out) {
        view().setBigUint64(out, 1000n, true);
        return 0;
      },
      random_get(ptr, len) {
        const bytes = new Uint8Array(getMemory().buffer, ptr, len);
        for (let i = 0; i < len; i++) bytes[i] = (Math.random() * 256) | 0;
        return 0;
      },
      fd_write(fd, iovs, iovsLen, written) {
        const v = view();
        let text = '', n = 0;
        for (let i = 0; i < iovsLen; i++) {
          const p = v.getUint32(iovs + i * 8, true), l = v.getUint32(iovs + i * 8 + 4, true);
          text += new TextDecoder().decode(new Uint8Array(getMemory().buffer, p, l));
          n += l;
        }
        v.setUint32(written, n, true);
        if (text.trim()) (fd === 2 ? console.error : console.log)('[stockhorse]', text.trimEnd());
        return 0;
      },
      environ_sizes_get(count, size) {
        view().setUint32(count, 0, true);
        view().setUint32(size, 0, true);
        return 0;
      },
      environ_get() { return 0; },
      args_sizes_get(count, size) {
        view().setUint32(count, 0, true);
        view().setUint32(size, 0, true);
        return 0;
      },
      args_get() { return 0; },
      proc_exit(code) { throw new Error(`stockhorse exited (${code})`); },
      sched_yield() { return 0; },
    };
    return new Proxy(fns, { get: (t, k) => t[k] || (() => ENOSYS), has: () => true });
  }

  async function bytesOf(src) {
    if (src instanceof ArrayBuffer || ArrayBuffer.isView(src)) return src;
    if (typeof fetch === 'function' && !(typeof process !== 'undefined' && process.versions?.node && !/^https?:/.test(src))) {
      const res = await fetch(src);
      if (!res.ok) throw new Error(`${src}: HTTP ${res.status}`);
      return res.arrayBuffer();
    }
    return require('fs').readFileSync(src);
  }

  async function load({ wasm, net, tasks } = {}) {
    let memory = null;
    const { instance } = await WebAssembly.instantiate(await bytesOf(wasm), {
      wasi_snapshot_preview1: wasi(() => memory),
    });
    const x = instance.exports;
    memory = x.memory;
    if (x._initialize) x._initialize();

    const enc = new TextEncoder(), dec = new TextDecoder();
    const result = () => dec.decode(new Uint8Array(memory.buffer, x.sk_result_ptr(), x.sk_result_len()));
    const withBuffer = (bytes, fn) => {
      const p = x.sk_alloc(bytes.length);
      new Uint8Array(memory.buffer, p, bytes.length).set(bytes);
      try { return fn(p, bytes.length); } finally { x.sk_free(p, bytes.length); }
    };
    const call = req => {
      const text = Object.entries(req)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(' ') : v}`)
        .join('\n');
      const err = withBuffer(enc.encode(text), (p, n) => x.sk_call(p, n));
      if (err) throw new Error(result());
      return JSON.parse(result());
    };

    let netName = 'G0';
    if (net) {
      const bytes = new Uint8Array(await bytesOf(net));
      if (withBuffer(bytes, (p, n) => x.sk_load_net(p, n))) throw new Error(`network: ${result()}`);
      netName = JSON.parse(result()).net;
    }

    const T = tasks || root.EngineTasks || (typeof require === 'function' ? require('./engine-tasks.js') : null);
    const MATE = 30000;
    return {
      net: netName,
      call,
      info: () => call({ cmd: 'info' }),
      // Same as EngineTasks.play: the Elo picks a node budget and a temperature.
      play({ fen, moves, elo, level, random = Math.random }) {
        if (elo === undefined || elo === null) elo = T.STRENGTH.legacy[level] ?? 1500;
        elo = T.clampElo(elo);
        const set = T.settingFor(elo);
        const r = call({ cmd: 'play', fen, moves, nodes: set.nodes, temp: set.temp, movetime: T.STRENGTH.movetime, r: random() });
        if (!r.best) return { best: null, score: r.score ?? -MATE, depth: 0, pv: [], elo };
        return { best: r.best, score: r.score, depth: r.depth, pv: r.pv, elo, nodes: r.nodes };
      },
      // For self-play (calibration): a ladder setting directly. Returns UCI moves.
      thinkAt({ fen, moves, nodes, temp, movetime, random = Math.random }) {
        return call({ cmd: 'play', fen, moves, nodes, temp, movetime, r: random() });
      },
      analyse: ({ fen, moves, movetime = 400, depth = 12 }) => call({ cmd: 'analyse', fen, moves, movetime, depth }),
      lines: ({ fen, moves, movetime = 1000, depth = 40, multipv = 3 }) =>
        call({ cmd: 'lines', fen, moves, movetime, depth, multipv }),
      evaluate: ({ fen, moves }) => call({ cmd: 'eval', fen, moves }).score,
    };
  }

  const api = { load };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WasmEngine = api;
})(typeof self !== 'undefined' ? self : globalThis);
