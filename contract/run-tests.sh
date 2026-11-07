#!/usr/bin/env bash
# Builds both contracts, then runs unit and sandbox integration tests.
set -euo pipefail
cd "$(dirname "$0")"   # contract/

(cd presafe && cargo near build non-reproducible-wasm --no-embed-abi)
(cd mock-ft && cargo near build non-reproducible-wasm --no-embed-abi)

cargo test -p presafe -p mock-ft

# near-sandbox needs an open-files hard limit of 65535. Some containers cap it lower;
# there, preload a test-only shim (see integration-tests/fdlimit-shim/fdlimit_shim.c).
if [ "$(ulimit -Hn)" != "unlimited" ] && [ "$(ulimit -Hn)" -lt 65535 ]; then
  shim="$(pwd)/target/fdlimit_shim.so"
  cc -shared -fPIC -O2 -o "$shim" integration-tests/fdlimit-shim/fdlimit_shim.c -ldl
  echo "open-files hard limit is $(ulimit -Hn); preloading $shim for the sandbox"
  export LD_PRELOAD="$shim"
fi
cargo test -p integration-tests -- --test-threads=1
