# Worker outputs

Live snapshot and proofs now live in `fixtures/` at the repo root.
This folder is only a fallback if those files are missing.

- `income-snapshot.json` — fallback snapshot
- `proof-*.json` — fallback issue bundles
- `slips-<address>.json` — private slips for `GET /api/slips/:address`.
  Never log that response.
