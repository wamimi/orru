#!/usr/bin/env bash
#
# Orru — Creditcoin post-deployment wiring, and the readback that proves it took.
#
# Deployment alone leaves a system that compiles, deploys, and rejects
# everything: CredentialRegistry cannot mark a nullifier it is not authorised
# for, and AttestationRegistry ignores every log from a payer it does not know.
# Both failures look like bugs in the proof.
#
#   ./script/wire-creditcoin.sh              # dry run + readback
#   ./script/wire-creditcoin.sh --broadcast  # apply, then read back
#   ./script/wire-creditcoin.sh --verify     # readback only
#
# Requires in contracts/.env:
#   CREDITCOIN_RPC_URL, SOURCE_CHAIN_KEY, PAYER_ANCHOR_ADDRESS
#   DEPLOYER_ACCOUNT, DEPLOYER_PASSWORD_FILE (optional)
#   CREDITCOIN_PAYERS   comma-separated; defaults to DEMO_PAYROLL_ADDRESS
#   POOL_FUNDING        mUSDC base units to mint into the pool (6 decimals)

set -euo pipefail
cd "$(dirname "$0")/.."

CHAIN_ID=102031
RECORD="deployments/${CHAIN_ID}.json"

BROADCAST=0
VERIFY_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --broadcast) BROADCAST=1 ;;
    --verify)    VERIFY_ONLY=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m    %s\n' "$*"; }
bad()  { printf '  \033[31mFAIL\033[0m  %s\n' "$*"; FAILURES=$((FAILURES+1)); }
info() { printf '        %s\n' "$*"; }
die()  { printf '  \033[31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

FAILURES=0

# Overridable so a run can be pointed at another configuration without
# editing the checked-out .env.
ENV_FILE="${ORRU_ENV_FILE:-./.env}"
set -a; . "$ENV_FILE" 2>/dev/null || true; set +a
: "${CREDITCOIN_RPC_URL:?CREDITCOIN_RPC_URL is not set in contracts/.env}"
RPC="$CREDITCOIN_RPC_URL"
DEPLOYER_ACCOUNT="${DEPLOYER_ACCOUNT:-cc3-deployer}"

AUTH=(--account "$DEPLOYER_ACCOUNT")
if [ -n "${DEPLOYER_PASSWORD_FILE:-}" ]; then
  [ -r "$DEPLOYER_PASSWORD_FILE" ] || die "cannot read DEPLOYER_PASSWORD_FILE at $DEPLOYER_PASSWORD_FILE"
  AUTH+=(--password-file "$DEPLOYER_PASSWORD_FILE")
fi

actual_chain=$(cast chain-id --rpc-url "$RPC" 2>/dev/null || echo "")
[ "$actual_chain" = "$CHAIN_ID" ] || die "RPC reports chain id '$actual_chain', expected $CHAIN_ID"

[ -f "$RECORD" ] || die "$RECORD not found — run ./script/deploy-creditcoin.sh --broadcast first"

read_addr() {
  python3 -c "
import json
try: print(json.load(open('$RECORD')).get('$1',''))
except Exception: print('')
"
}

ATTESTATIONS=$(read_addr AttestationRegistry)
NULLIFIERS=$(read_addr NullifierRegistry)
CREDENTIALS=$(read_addr CredentialRegistry)
VERIFIER=$(read_addr IncomeVerifier)
TOKEN=$(read_addr MockUSDC)
POOL=$(read_addr DemoCreditPool)

for pair in "AttestationRegistry:$ATTESTATIONS" "NullifierRegistry:$NULLIFIERS" \
            "CredentialRegistry:$CREDENTIALS" "IncomeVerifier:$VERIFIER" \
            "MockUSDC:$TOKEN" "DemoCreditPool:$POOL"; do
  [ -n "${pair#*:}" ] || die "${pair%%:*} is missing from $RECORD — deployment is incomplete"
done

PAYERS="${CREDITCOIN_PAYERS:-${DEMO_PAYROLL_ADDRESS:-}}"
[ -n "$PAYERS" ] || die "set CREDITCOIN_PAYERS (or DEMO_PAYROLL_ADDRESS) to the payroll address to approve"

# Mint enough that the pool can actually pay out. Band 9 permits 30% of $25,000
# per credential, so a demo with a handful of workers wants six figures.
POOL_FUNDING="${POOL_FUNDING:-1000000000000}"

send() {
  local label="$1"; shift
  if [ "$BROADCAST" != "1" ]; then
    printf '  \033[36mwould send\033[0m %s\n' "$label"
    printf '        cast send %s\n' "$*"
    return 0
  fi
  printf '  sending %s ...\n' "$label"
  local out status
  out=$(cast send --rpc-url "$RPC" "${AUTH[@]}" --json "$@" 2>&1) \
    || die "$label failed: $(echo "$out" | tail -3 | tr '\n' ' ')"
  # Same whole-blob parse as the deploy script: cast send --json is pretty-printed.
  status=$(printf '%s' "$out" | python3 -c '
import sys, json, re
raw = sys.stdin.read()
found = ""
i, j = raw.find("{"), raw.rfind("}")
if i != -1 and j > i:
    try:
        found = json.loads(raw[i:j + 1]).get("status", "") or ""
    except Exception:
        found = ""
for pattern in (r"\"status\"\s*:\s*\"(0x[0-9a-fA-F]+)\"", r"^status\s+(\S+)"):
    if found:
        break
    m = re.search(pattern, raw, re.M)
    found = m.group(1) if m else ""
print(found)
' 2>/dev/null)
  # A mined receipt with status 0x0 is a failure, not a success.
  [ "$status" = "0x1" ] || die "$label mined with status=$status"
  ok "$label"
}

# --- apply ------------------------------------------------------------------
if [ "$VERIFY_ONLY" != "1" ]; then
  bold "Wiring"

  authorized=$(cast call "$NULLIFIERS" "authorized(address)(bool)" "$CREDENTIALS" --rpc-url "$RPC" 2>/dev/null || echo "")
  if [ "$authorized" = "true" ]; then
    ok "CredentialRegistry already authorized on NullifierRegistry"
  else
    send "authorize CredentialRegistry on NullifierRegistry" \
      "$NULLIFIERS" "setAuthorized(address,bool)" "$CREDENTIALS" true
  fi

  IFS=',' read -ra PAYER_LIST <<< "$PAYERS"
  for payer in "${PAYER_LIST[@]}"; do
    payer="$(echo "$payer" | tr -d '[:space:]')"
    [ -n "$payer" ] || continue
    approved=$(cast call "$ATTESTATIONS" "approvedPayer(address)(bool)" "$payer" --rpc-url "$RPC" 2>/dev/null || echo "")
    if [ "$approved" = "true" ]; then
      ok "payer $payer already approved"
    else
      send "approve payer $payer" "$ATTESTATIONS" "setPayerApproval(address,bool)" "$payer" true
    fi
  done

  bold "Funding"
  balance=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$POOL" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}' || true)
  # A dust balance is not funding. Compared against the requested amount so a
  # single base unit cannot skip the mint and still pass readback.
  if [ "${balance:-0}" -ge "$POOL_FUNDING" ] 2>/dev/null; then
    ok "pool already holds $balance mUSDC base units"
  else
    send "mint $POOL_FUNDING mUSDC to the pool" "$TOKEN" "mint(address,uint256)" "$POOL" "$POOL_FUNDING"
  fi
fi

# --- readback ---------------------------------------------------------------
bold "Readback"

check_addr() {
  local label="$1" got="${2:-}" want="${3:-}"
  if [ "$(echo "$got" | tr 'A-Z' 'a-z')" = "$(echo "$want" | tr 'A-Z' 'a-z')" ]; then
    ok "$label -> $got"
  else
    bad "$label is $got, expected $want"
  fi
}

check_addr "CredentialRegistry.attestations" \
  "$(cast call "$CREDENTIALS" "attestations()(address)" --rpc-url "$RPC" 2>/dev/null | head -1)" "$ATTESTATIONS"
check_addr "CredentialRegistry.nullifiers " \
  "$(cast call "$CREDENTIALS" "nullifiers()(address)" --rpc-url "$RPC" 2>/dev/null | head -1)" "$NULLIFIERS"
check_addr "CredentialRegistry.verifier   " \
  "$(cast call "$CREDENTIALS" "verifier()(address)" --rpc-url "$RPC" 2>/dev/null | head -1)" "$VERIFIER"
check_addr "DemoCreditPool.token          " \
  "$(cast call "$POOL" "token()(address)" --rpc-url "$RPC" 2>/dev/null | head -1)" "$TOKEN"
check_addr "DemoCreditPool.credentials    " \
  "$(cast call "$POOL" "credentials()(address)" --rpc-url "$RPC" 2>/dev/null | head -1)" "$CREDENTIALS"

# TRUSTED-SOURCE and the source chain key are immutable. Wrong here means
# redeploy, not reconfigure — which is why they are checked rather than assumed.
check_addr "AttestationRegistry.TRUSTED_ANCHOR" \
  "$(cast call "$ATTESTATIONS" "TRUSTED_ANCHOR()(address)" --rpc-url "$RPC" 2>/dev/null | head -1)" \
  "${PAYER_ANCHOR_ADDRESS:-}"

key=$(cast call "$ATTESTATIONS" "SOURCE_CHAIN_KEY()(uint64)" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}' || true)
[ "$key" = "${SOURCE_CHAIN_KEY:-}" ] \
  && ok "AttestationRegistry.SOURCE_CHAIN_KEY -> $key" \
  || bad "AttestationRegistry.SOURCE_CHAIN_KEY is $key, expected ${SOURCE_CHAIN_KEY:-unset}"

auth=$(cast call "$NULLIFIERS" "authorized(address)(bool)" "$CREDENTIALS" --rpc-url "$RPC" 2>/dev/null | head -1 || true)
[ "$auth" = "true" ] \
  && ok "NullifierRegistry authorizes CredentialRegistry" \
  || bad "NullifierRegistry does NOT authorize CredentialRegistry — every issue() will revert"

IFS=',' read -ra PAYER_LIST <<< "$PAYERS"
for payer in "${PAYER_LIST[@]}"; do
  payer="$(echo "$payer" | tr -d '[:space:]')"
  [ -n "$payer" ] || continue
  approved=$(cast call "$ATTESTATIONS" "approvedPayer(address)(bool)" "$payer" --rpc-url "$RPC" 2>/dev/null | head -1 || true)
  [ "$approved" = "true" ] \
    && ok "payer approved $payer" \
    || bad "payer NOT approved $payer — its logs are ignored and execute() reverts NoTrustedLogs"
done

pool_balance=$(cast call "$TOKEN" "balanceOf(address)(uint256)" "$POOL" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}' || true)
if [ "${pool_balance:-0}" -ge "$POOL_FUNDING" ] 2>/dev/null; then
  ok "pool liquidity $pool_balance mUSDC base units"
else
  bad "pool holds ${pool_balance:-0} mUSDC, wanted at least $POOL_FUNDING — disburse() runs dry"
fi

# A zero floor accepts evidence of any age. The constructor refuses it, so a zero
# here means this pool was not deployed by this script.
floor=$(cast call "$POOL" "minimumEvidenceHeight()(uint64)" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}' || true)
[ -n "${floor:-}" ] && [ "${floor:-0}" != "0" ] \
  && ok "freshness floor at source height $floor" \
  || bad "pool has no freshness floor — it would lend against evidence of any age"

# Libraries are linked by address. A wrong one is invisible in every check above:
# the top-level contracts still have code and still report the right immutables.
check_library() {
  local label="$1" addr="$2" artifact="$3" consumer_label="$4" consumer="$5"

  local onchain
  onchain=$(cast code "$addr" --rpc-url "$RPC" 2>/dev/null | tr -d '[:space:]' || true)
  if [ "${#onchain}" -le 2 ]; then
    bad "$label has no code at $addr — linking is broken"
    return
  fi

  local want
  want=$(python3 -c "
import json
try:
    d = json.load(open('$artifact'))
    print(len(d['deployedBytecode']['object']))
except Exception:
    print(0)
" || true)
  # An unreadable artifact must not read as agreement. Length is a weak check —
  # different bytecode of the same length passes — but silently skipping it is
  # worse, because the readback then claims something it never verified.
  if [ "${want:-0}" -le 0 ]; then
    bad "$label could not be compared: $artifact is missing or unreadable (run forge build)"
  elif [ "${#onchain}" != "$want" ]; then
    bad "$label at $addr is ${#onchain} chars of code, the local build is $want — different library"
  else
    ok "$label $addr length matches the local build"
  fi

  # The linked address is baked into the consumer's runtime code.
  local needle consumer_code
  needle=$(printf '%s' "$addr" | sed 's/^0x//' | tr 'A-Z' 'a-z')
  consumer_code=$(cast code "$consumer" --rpc-url "$RPC" 2>/dev/null | tr -d '[:space:]' | tr 'A-Z' 'a-z' || true)
  case "$consumer_code" in
    *"$needle"*) ok "$consumer_label links $label" ;;
    *) bad "$consumer_label does not embed $label at $addr — it was linked to something else" ;;
  esac
}

check_library "EvmV1Decoder  " "$(read_addr EvmV1Decoder)" \
  "out/EvmV1Decoder.sol/EvmV1Decoder.json" "AttestationRegistry" "$ATTESTATIONS"
check_library "ZKTranscriptLib" "$(read_addr ZKTranscriptLib)" \
  "out/IncomeVerifier.sol/ZKTranscriptLib.json" "IncomeVerifier    " "$VERIFIER"

echo
if [ "$FAILURES" -eq 0 ]; then
  if [ "$BROADCAST" != "1" ] && [ "$VERIFY_ONLY" != "1" ]; then
    printf '\033[33m  dry run — nothing was sent. Re-run with --broadcast to apply.\033[0m\n'
  else
    printf '\033[32m  Creditcoin side is wired and ready.\033[0m\n'
    cat <<NEXT

  Put these in contracts/.env so the worker can reach them:

    ATTESTATION_REGISTRY_ADDRESS=$ATTESTATIONS
    CREDENTIAL_REGISTRY_ADDRESS=$CREDENTIALS

  Then relay the payments already anchored on Sepolia:

    cd ../worker && npm run scan && npm run attest -- --submit
NEXT
  fi
  exit 0
fi

printf '\033[31m  %d check(s) failed — do not demo until these are green.\033[0m\n' "$FAILURES"
exit 1
