#!/usr/bin/env bash
#
# Orru — Creditcoin testnet deployment.
#
# Uses `forge create`, not `forge script`. Creditcoin block headers omit
# prevRandao, which makes forge script fail against it; bypass_prevrandao is set
# in foundry.toml but is unverified on forge 1.2.3. Every Creditcoin deployment
# in the proven 19 Aug pipeline used forge create.
#
# Idempotent: anything already recorded in deployments/102031.json is skipped,
# so a failed run is resumed by running it again.
#
#   ./script/deploy-creditcoin.sh              # dry run, broadcasts nothing
#   ./script/deploy-creditcoin.sh --broadcast  # deploys
#   ./script/deploy-creditcoin.sh --check      # read back what is deployed
#
# Requires in contracts/.env:
#   CREDITCOIN_RPC_URL, SOURCE_CHAIN_KEY, PAYER_ANCHOR_ADDRESS
#   DEPLOYER_ACCOUNT           keystore name, e.g. cc3-deployer
#   DEPLOYER_PASSWORD_FILE     optional; prompts interactively when unset
#   CREDITCOIN_OWNER           optional; defaults to the deployer address

set -euo pipefail
cd "$(dirname "$0")/.."

CHAIN_ID=102031
RECORD="deployments/${CHAIN_ID}.json"

BROADCAST=0
CHECK_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --broadcast) BROADCAST=1 ;;
    --check)     CHECK_ONLY=1 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
ok()   { printf '  \033[32mok\033[0m    %s\n' "$*"; }
info() { printf '        %s\n' "$*"; }
warn() { printf '  \033[33mwarn\033[0m  %s\n' "$*"; }
die()  { printf '  \033[31mFATAL\033[0m %s\n' "$*" >&2; exit 1; }

set -a; . ./.env 2>/dev/null || true; set +a

: "${CREDITCOIN_RPC_URL:?CREDITCOIN_RPC_URL is not set in contracts/.env}"
: "${SOURCE_CHAIN_KEY:?SOURCE_CHAIN_KEY is not set in contracts/.env}"
: "${PAYER_ANCHOR_ADDRESS:?PAYER_ANCHOR_ADDRESS is not set in contracts/.env}"
DEPLOYER_ACCOUNT="${DEPLOYER_ACCOUNT:-cc3-deployer}"

RPC="$CREDITCOIN_RPC_URL"

# --- authentication ---------------------------------------------------------
AUTH=(--account "$DEPLOYER_ACCOUNT")
if [ -n "${DEPLOYER_PASSWORD_FILE:-}" ]; then
  [ -r "$DEPLOYER_PASSWORD_FILE" ] || die "cannot read DEPLOYER_PASSWORD_FILE at $DEPLOYER_PASSWORD_FILE"
  AUTH+=(--password-file "$DEPLOYER_PASSWORD_FILE")
fi

# --- record helpers ---------------------------------------------------------
mkdir -p deployments

# Only a real deployment creates the record. A dry run that leaves an empty file
# behind makes wire-creditcoin.sh report a half-finished deployment.
ensure_record() { [ -f "$RECORD" ] || echo '{}' > "$RECORD"; }

read_addr() {
  python3 -c "
import json,sys
try: print(json.load(open('$RECORD')).get('$1',''))
except Exception: print('')
"
}

write_addr() {
  ensure_record
  python3 -c "
import json
p='$RECORD'
try: d=json.load(open(p))
except Exception: d={}
d['$1']='$2'
json.dump(d, open(p,'w'), indent=2, sort_keys=True)
open(p,'a').write('\n')
"
}

# --- preflight --------------------------------------------------------------
bold "Preflight"

actual_chain=$(cast chain-id --rpc-url "$RPC" 2>/dev/null || echo "")
[ "$actual_chain" = "$CHAIN_ID" ] || die "RPC reports chain id '$actual_chain', expected $CHAIN_ID"
ok "chain id $CHAIN_ID"

# A source chain KEY is not an EVM chain id. Sepolia is 1, mainnet is 3. An EVM
# chain id here builds a registry that will never match a real proof, and the
# field is immutable.
case "$SOURCE_CHAIN_KEY" in
  1|2|3) ok "source chain key $SOURCE_CHAIN_KEY" ;;
  11155111|8453|84532|137|42161|10)
    die "SOURCE_CHAIN_KEY is $SOURCE_CHAIN_KEY, an EVM chain id. Sepolia is 1, Ethereum mainnet is 3." ;;
  *) warn "source chain key $SOURCE_CHAIN_KEY is unusual — Sepolia is 1, Ethereum mainnet is 3" ;;
esac

[ "$(cast code "$PAYER_ANCHOR_ADDRESS" --rpc-url "${SEPOLIA_RPC_URL:-$RPC}" 2>/dev/null | wc -c)" -gt 4 ] \
  && ok "PayerAnchor $PAYER_ANCHOR_ADDRESS has code on the source chain" \
  || warn "could not confirm code at $PAYER_ANCHOR_ADDRESS — TRUSTED_ANCHOR is immutable, check it"

# A dry run should not ask for a keystore password. Set DEPLOYER_ADDRESS to skip
# the prompt entirely; broadcasting still unlocks the keystore.
if [ -n "${DEPLOYER_ADDRESS:-}" ]; then
  DEPLOYER="$DEPLOYER_ADDRESS"
elif [ "$BROADCAST" = "1" ] || [ -n "${DEPLOYER_PASSWORD_FILE:-}" ]; then
  DEPLOYER=$(cast wallet address "${AUTH[@]}" 2>/dev/null) || die "could not unlock keystore '$DEPLOYER_ACCOUNT'"
else
  DEPLOYER=""
  info "deployer unknown — set DEPLOYER_ADDRESS to check its balance without unlocking"
fi

OWNER="${CREDITCOIN_OWNER:-$DEPLOYER}"
[ -n "$OWNER" ] || OWNER="<deployer>"
[ -n "$DEPLOYER" ] && ok "deployer $DEPLOYER"
ok "owner    $OWNER"

if [ -n "$DEPLOYER" ]; then
  balance=$(cast balance "$DEPLOYER" --rpc-url "$RPC" 2>/dev/null || echo 0)
  info "balance  $(cast from-wei "$balance") CTC"
  if [ "$balance" = "0" ]; then
    [ "$BROADCAST" = "1" ] && die "deployer has no CTC — fund it before deploying"
    warn "deployer has no CTC — fund it before broadcasting"
  fi
fi

if [ "$CHECK_ONLY" = "1" ]; then
  bold "Recorded deployments"
  [ -f "$RECORD" ] && cat "$RECORD" || echo "  (nothing deployed yet)"
  exit 0
fi

# --- build ------------------------------------------------------------------
# A stale artifact for a regenerated verifier is undeployable in a way that only
# shows up as a size error at broadcast time.
bold "Build"
if [ "$BROADCAST" = "1" ]; then
  forge clean >/dev/null
fi
forge build --sizes 2>&1 | grep -E "HonkVerifier|AttestationRegistry|CredentialRegistry|DemoCreditPool" || true
ok "built"

# --- deploy -----------------------------------------------------------------
LIB_ARGS=()

deploy() {
  local key="$1" target="$2"; shift 2

  local existing
  existing=$(read_addr "$key")
  if [ -n "$existing" ]; then
    ok "$key already at $existing"
    return 0
  fi

  # --broadcast MUST precede --constructor-args: forge's variadic parsing
  # swallows any flag that follows it and silently stays in dry-run.
  local cmd=(forge create "$target" --rpc-url "$RPC" "${AUTH[@]}")
  [ ${#LIB_ARGS[@]} -gt 0 ] && cmd+=("${LIB_ARGS[@]}")
  [ "$BROADCAST" = "1" ] && cmd+=(--broadcast)
  [ $# -gt 0 ] && cmd+=(--constructor-args "$@")

  if [ "$BROADCAST" != "1" ]; then
    printf '  \033[36mwould deploy\033[0m %s\n' "$key"
    printf '        %s\n' "${cmd[*]}"
    return 0
  fi

  printf '  deploying %s ...\n' "$key"
  local out addr
  out=$("${cmd[@]}" --json 2>&1) || die "$key deployment failed: $(echo "$out" | tail -3 | tr '\n' ' ')"

  addr=$(echo "$out" | python3 -c "
import sys,json
for line in sys.stdin:
    line=line.strip()
    if line.startswith('{'):
        try:
            d=json.loads(line)
            if d.get('deployedTo'): print(d['deployedTo']); break
        except Exception: pass
")
  [ -n "$addr" ] || die "$key deployed but no address parsed from: $(echo "$out" | tail -3)"

  write_addr "$key" "$addr"
  ok "$key $addr"
}

bold "Libraries"
LIB_ARGS=()
deploy EvmV1Decoder "node_modules/@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder"
deploy ZKTranscriptLib "src/verifier/IncomeVerifier.sol:ZKTranscriptLib"

DECODER=$(read_addr EvmV1Decoder)
TRANSCRIPT=$(read_addr ZKTranscriptLib)

bold "Verifier"
if [ -n "$TRANSCRIPT" ]; then
  LIB_ARGS=(--libraries "src/verifier/IncomeVerifier.sol:ZKTranscriptLib:$TRANSCRIPT")
else
  LIB_ARGS=(--libraries "src/verifier/IncomeVerifier.sol:ZKTranscriptLib:<ZKTranscriptLib>")
fi
deploy IncomeVerifier "src/verifier/IncomeVerifier.sol:HonkVerifier"

bold "Registries"
if [ -n "$DECODER" ]; then
  LIB_ARGS=(--libraries "node_modules/@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder:$DECODER")
else
  LIB_ARGS=(--libraries "node_modules/@gluwa/usc-contracts/contracts/decoding/EvmV1Decoder.sol:EvmV1Decoder:<EvmV1Decoder>")
fi
deploy AttestationRegistry "src/creditcoin/AttestationRegistry.sol:AttestationRegistry" \
  "$SOURCE_CHAIN_KEY" "$PAYER_ANCHOR_ADDRESS" "$OWNER"

LIB_ARGS=()
deploy NullifierRegistry "src/creditcoin/NullifierRegistry.sol:NullifierRegistry" "$OWNER"

ATTESTATIONS=$(read_addr AttestationRegistry)
NULLIFIERS=$(read_addr NullifierRegistry)
VERIFIER=$(read_addr IncomeVerifier)

deploy CredentialRegistry "src/creditcoin/CredentialRegistry.sol:CredentialRegistry" \
  "${ATTESTATIONS:-<AttestationRegistry>}" "${NULLIFIERS:-<NullifierRegistry>}" \
  "${VERIFIER:-<IncomeVerifier>}" "$OWNER"

bold "Settlement"
# Two contracts are named MockUSDC — this one and test/mocks/Tokens.sol — so the
# fully qualified path is required, here and everywhere else in this script.
deploy MockUSDC "src/creditcoin/MockUSDC.sol:MockUSDC" "$OWNER"

CREDENTIALS=$(read_addr CredentialRegistry)
TOKEN=$(read_addr MockUSDC)

deploy DemoCreditPool "src/creditcoin/DemoCreditPool.sol:DemoCreditPool" \
  "${TOKEN:-<MockUSDC>}" "${CREDENTIALS:-<CredentialRegistry>}" "$OWNER"

# --- report -----------------------------------------------------------------
bold "Recorded"
[ -f "$RECORD" ] && cat "$RECORD" || echo "  (nothing deployed yet)"

if [ "$BROADCAST" != "1" ]; then
  echo
  warn "dry run — nothing was broadcast. Re-run with --broadcast to deploy."
  exit 0
fi

cat <<NEXT

Next, nothing works until the contracts are wired to each other:

  ./script/wire-creditcoin.sh --broadcast

Then copy these into contracts/.env for the worker:

  ATTESTATION_REGISTRY_ADDRESS=$(read_addr AttestationRegistry)
  CREDENTIAL_REGISTRY_ADDRESS=$(read_addr CredentialRegistry)
NEXT
