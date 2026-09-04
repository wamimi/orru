#!/usr/bin/env bash
#
# Orru — hourly payroll cron.
#
# Safe to fire every hour against 4-hour periods: runPayroll() settles one
# period at a time, so three of four firings are expected to skip. That
# redundancy lets a missed firing be caught up rather than lost.
#
# Install:
#   chmod +x script/run-payroll.sh
#   crontab -e   ->   7 * * * * /Users/xiaomao/orru/contracts/script/run-payroll.sh
#
# Requires in contracts/.env:
#   SEPOLIA_RPC_URL, DEMO_PAYROLL_ADDRESS, KEEPER_ACCOUNT, KEEPER_PASSWORD_FILE

set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

LOG_DIR="${ORRU_LOG_DIR:-$HOME/.orru}"
mkdir -p "$LOG_DIR"
LOG="$LOG_DIR/payroll.log"

log() { printf '%s  %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG"; }

set -a; . ./.env 2>/dev/null; set +a

for v in SEPOLIA_RPC_URL DEMO_PAYROLL_ADDRESS KEEPER_ACCOUNT KEEPER_PASSWORD_FILE; do
  if [ -z "${!v:-}" ]; then log "FATAL  $v is not set in contracts/.env"; exit 1; fi
done

if [ ! -r "$KEEPER_PASSWORD_FILE" ]; then
  log "FATAL  cannot read KEEPER_PASSWORD_FILE at $KEEPER_PASSWORD_FILE"
  exit 1
fi

P="$DEMO_PAYROLL_ADDRESS"
RPC="$SEPOLIA_RPC_URL"

current=$(cast call "$P" "currentPeriod()(uint256)" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}')
next=$(cast call    "$P" "nextDuePeriod()(uint256)"  --rpc-url "$RPC" 2>/dev/null | awk '{print $1}')
last=$(cast call    "$P" "lastPaidPeriod()(uint256)" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}')

if [ -z "$current" ] || [ -z "$next" ] || [ -z "$last" ]; then
  log "ERROR  could not read period state - RPC down or wrong address?"
  exit 1
fi

# nextDuePeriod can exceed current even when current != last, so comparing
# those two alone would send a reverting transaction.
if [ "$next" -gt "$current" ]; then
  log "skip   nothing due (next $next > current $current)"
  exit 0
fi

# Warn BEFORE attempting. A run that reverts on funding still burns a cron slot,
# and four burnt slots in a row is a lost period.
short=$(cast call "$P" "fundingShortfall()(uint256)" --rpc-url "$RPC" 2>/dev/null | awk '{print $1}')
if [ -n "$short" ] && [ "$short" != "0" ]; then
  log "ALARM  underfunded by $short USDC base units (6dp) — TOP UP NOW, period $current at risk"
fi

log "run    period $next (last paid $last)"

out=$(cast send "$P" "runPayroll()" \
        --rpc-url "$RPC" \
        --account "$KEEPER_ACCOUNT" \
        --password-file "$KEEPER_PASSWORD_FILE" \
        --json 2>&1)
rc=$?

if [ $rc -ne 0 ]; then
  log "ERROR  runPayroll failed: $(echo "$out" | tr '\n' ' ' | cut -c1-400)"
  exit 1
fi

txhash=$(echo "$out" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("transactionHash",""))' 2>/dev/null)
status=$(echo "$out" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("status",""))' 2>/dev/null)

# A mined receipt with status 0x0 is a failure, not a success.
if [ "$status" != "0x1" ]; then
  log "ERROR  runPayroll mined with status=$status tx=$txhash"
  exit 1
fi

log "OK     period $next  status=$status  tx=$txhash"
