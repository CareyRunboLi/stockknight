#!/bin/sh
# Builds Stockhorse for the browser: web/engine/stockhorse.wasm (crates/wasm, with WebAssembly
# SIMD). Needs the target once: rustup target add wasm32-wasip1
set -e
cd "$(dirname "$0")/.."
RUSTFLAGS="-C target-feature=+simd128" cargo build --release --target wasm32-wasip1 -p sk-wasm
mkdir -p web/engine
cp target/wasm32-wasip1/release/sk_wasm.wasm web/engine/stockhorse.wasm
ls -l web/engine/stockhorse.wasm
