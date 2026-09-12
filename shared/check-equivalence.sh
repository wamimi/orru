#!/usr/bin/env bash
# The commitment equivalence gate. Solidity, Noir and TypeScript must all agree
# on the same fixed vector. Nothing downstream is trustworthy until this passes.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "== Toolchain =="
NARGO_WANT="1.0.0-beta.18"
BB_WANT="3.0.0-nightly.20260102"
nargo_have=$(nargo --version 2>/dev/null | sed -n 's/.*nargo version = \([^ ]*\).*/\1/p' | head -1)
bb_have=$(bb --version 2>/dev/null | head -1)
if [ "$nargo_have" != "$NARGO_WANT" ]; then
  echo "  nargo $nargo_have, expected $NARGO_WANT - regenerate and re-check the verifier"
  fail=1
else
  echo "  nargo $nargo_have"
fi
if [ "$bb_have" != "$BB_WANT" ]; then
  echo "  bb $bb_have, expected $BB_WANT - regenerate and re-check the verifier"
  fail=1
else
  echo "  bb $bb_have"
fi

echo "== Solidity =="
(cd contracts && forge test --match-path 'test/shared/*' 2>&1 | tail -2) || fail=1

echo "== Noir =="
(cd circuits/income_proof && nargo test 2>&1 | tail -2) || fail=1

echo "== TypeScript =="
(cd shared && npx tsx commitment.test.ts 2>&1 | tail -2) || fail=1

echo "== Bands =="
(cd shared && npx tsx bands.test.ts 2>&1 | tail -2) || fail=1

echo "== Witness encoders =="
# The worker proves with nargo, the browser with bb.js, and each has its own
# implementation of the limb split and salt byte order. A divergence produces
# proofs the deployed verifier rejects for no visible reason.
if (cd worker && node --import tsx --test src/encoders.test.ts >/dev/null 2>&1); then
  echo "  worker and browser encoders agree"
else
  echo "  ENCODERS DISAGREE - cd worker && node --import tsx --test src/encoders.test.ts"
  fail=1
fi

echo "== Browser circuit artifact =="
# Served to the browser, and must be the circuit the deployed verifier was
# generated from. Stale here means every browser proof fails on-chain.
if artifact_check=$(python3 - <<'PYEOF'
import json, sys
try:
    built = json.load(open("circuits/income_proof/target/income_proof.json"))
    served = json.load(open("public/circuit/income_proof.json"))
except Exception as e:
    print(f"unreadable: {e}"); sys.exit(1)
for key in ("noir_version", "hash", "bytecode", "abi"):
    if built.get(key) != served.get(key):
        print(f"{key} differs from the compiled circuit"); sys.exit(1)
print("matches the compiled circuit")
PYEOF
); then
  echo "  $artifact_check"
else
  echo "  $artifact_check"
  fail=1
fi

echo
[ $fail -eq 0 ] && echo "EQUIVALENCE: GREEN" || echo "EQUIVALENCE: BROKEN"
exit $fail
