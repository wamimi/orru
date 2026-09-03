#!/usr/bin/env bash
# The commitment equivalence gate. Solidity, Noir and TypeScript must all agree
# on the same fixed vector. Nothing downstream is trustworthy until this passes.
set -uo pipefail
cd "$(dirname "$0")/.."
fail=0

echo "== Solidity =="
(cd contracts && forge test --match-path 'test/shared/*' 2>&1 | tail -2) || fail=1

echo "== Noir =="
(cd circuits/income_proof && nargo test 2>&1 | tail -2) || fail=1

echo "== TypeScript =="
(cd shared && npx tsx commitment.test.ts 2>&1 | tail -2) || fail=1

echo
[ $fail -eq 0 ] && echo "COMMITMENT EQUIVALENCE: GREEN" || echo "COMMITMENT EQUIVALENCE: BROKEN"
exit $fail
