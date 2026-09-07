#!/usr/bin/env bash
#
# Regenerates everything in fixtures/ from the live chains.
#
# Run this when the frontend reports CommitmentNotAttestedToPayer — the attested
# window has moved past what the fixtures were built over. Read-only apart from
# the attestation relay, which needs the relayer keystore.
#
#   ./worker/refresh-fixtures.sh              # scan, prove, snapshot
#   ./worker/refresh-fixtures.sh --attest     # also relay new anchors first

set -euo pipefail
cd "$(dirname "$0")"

set -a; . ../contracts/.env 2>/dev/null || true; set +a
: "${WORKER_START_BLOCK:=11605464}"; export WORKER_START_BLOCK

PAYROLL=0xD3a8Fd44b63890d518d15e3efECfA11a71276B3d
SEMUNI=0x0531203274075Ff79A07000BBDa2B0272C647d01

echo "==> scanning"
npm run --silent scan

if [ "${1:-}" = "--attest" ]; then
  echo "==> relaying new anchors"
  npm run --silent attest -- --submit --limit 25
fi

echo "==> proving"
# Semuni's salts live in worker/slips and exist nowhere else, which is why this
# script cannot run anywhere but here.
for pair in \
  "0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C:$PAYROLL:f6A48D18-payroll-band4" \
  "0xBb605cf7604ef843e9Df15559257a73989DAe75A:$PAYROLL:Bb605cf7-payroll-band4" \
  "0xBb605cf7604ef843e9Df15559257a73989DAe75A:$SEMUNI:Bb605cf7-semuni-band6" \
  "0xe058c2056249287B429607814C9F21Ed48cE3B34:$PAYROLL:e058c205-payroll-band5" \
  "0x722533cA456a2B845b10e808B0e13Ec5e4134f27:$PAYROLL:722533cA-payroll-band1"; do
  recipient="${pair%%:*}"; rest="${pair#*:}"; payer="${rest%%:*}"; name="${rest#*:}"

  if npx tsx src/index.ts prove --recipient "$recipient" --payer "$payer" >/dev/null 2>&1; then
    newest=$(ls -t "out/proof-${recipient}-"*.json | head -1)
    cp "$newest" "../fixtures/proof-${name}.json"
    echo "    ok   $name"
  else
    echo "    SKIP $name — no attested window; run with --attest"
  fi
done

echo "==> snapshot"
npm run --silent snapshot >/dev/null
cp out/income-snapshot.json ../fixtures/income-snapshot.json

echo "==> manifest"
python3 - <<'PYEOF'
import json, glob, os
from datetime import datetime, timezone

entries = []
for f in sorted(glob.glob("../fixtures/proof-*.json")):
    d = json.load(open(f))
    entries.append({
        "file": os.path.basename(f),
        "subject": d["subject"],
        "evidencePayer": d["evidencePayer"],
        "band": d["band"],
        "bandLabel": d["bandLabel"],
        "periods": d["periods"],
        "canSignIssuance": d["subject"].lower() == "0xf6a48d18da6072eaddbf5d2bfb9fe9263de0b66c",
    })

old = {}
try:
    old = json.load(open("../fixtures/manifest.json"))
except Exception:
    pass

json.dump({
    "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "note": old.get("note", ""),
    "staleSymptom": old.get("staleSymptom", "CommitmentNotAttestedToPayer(bytes32,address) on issue()"),
    "regeneratedBy": old.get("regeneratedBy", "Nelly"),
    "proofs": entries,
    "snapshotGeneratedAt": json.load(open("../fixtures/income-snapshot.json"))["generatedAt"],
}, open("../fixtures/manifest.json", "w"), indent=2)
open("../fixtures/manifest.json", "a").write("\n")

for e in entries:
    print(f"    {e['file']:38} periods {','.join(e['periods'])}")
PYEOF

echo
echo "Done. Commit fixtures/ and push so the frontend picks them up."
