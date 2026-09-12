/**
 * Offline checks for short-id lookup and statement-scoped lender reports.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = JSON.parse(readFileSync("fixtures/aliases.json", "utf8"));
const expected = {
  "7b6a24eb": "0x7b6a24eb96a3eaf45f9dd61e5fcf9716ca4ad52a80a1ee09b93518ba150bf026",
  "55c29575": "0x55c29575d274416422e66e07a2f70958460fe293280952aed6005e4ca3dc2a5e",
  "576b974c": "0x576b974c3859ee51519e8714caa52a8f23e8a460dae68f6f507e22bcc9846704",
  "b9e81cf2": "0xb9e81cf2e71c26290400fcd3845b8ebff6d6cebfddf2425787eee8af7aac0208",
};

for (const [token, id] of Object.entries(expected)) {
  const seeded = seed.aliases[token]?.toLowerCase();
  assert.equal(seeded, id, `seed missing ${token}`);
}

function tokenFromCredentialId(credentialId) {
  return credentialId.slice(2, 10).toLowerCase();
}

function applyIssuedIds(aliases, credentialIds) {
  for (const raw of credentialIds) {
    if (!/^0x[0-9a-f]{64}$/i.test(raw)) continue;
    const id = raw.toLowerCase();
    aliases.set(tokenFromCredentialId(id), id);
  }
}

const aliases = new Map();
applyIssuedIds(aliases, [
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "0xaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
]);
assert.equal(
  aliases.get("aaaaaaaa"),
  "0xaaaaaaaabbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "later issued id wins a prefix collision",
);
applyIssuedIds(aliases, ["not-an-id"]);
assert.equal(aliases.size, 1, "invalid ids are ignored");

function reasonsFromCredential(credential) {
  const periodsOk = credential.periodsProven >= 3;
  const bandOk = Boolean(credential.incomeBand && credential.incomeBand.id >= 2);
  const payerOk = Boolean(credential.evidencePayer);
  const statusOk = credential.status === "valid";
  return [
    { code: periodsOk ? "PERIODS_OK" : "PERIODS_FAIL", pass: periodsOk, detail: `${credential.periodsProven} consecutive periods verified` },
    { code: bandOk ? "BAND_OK" : "BAND_FAIL", pass: bandOk },
    { code: payerOk ? "PAYER_TIER_1" : "PAYER_UNRECOGNISED", pass: payerOk },
    { code: statusOk ? "STATEMENT_VALID" : "STATEMENT_INACTIVE", pass: statusOk },
  ];
}

function evidenceForStatement(incomes, credential) {
  const needle = credential.evidencePayer?.toLowerCase();
  const row = incomes.find(
    (item) =>
      item.payerAddress.toLowerCase() === needle ||
      item.evidencePayer?.toLowerCase() === needle,
  );
  if (!row || credential.periodsProven <= 0) return [];
  const matching = row.evidence.filter((item) => {
    if (item.attested === false) return false;
    if (credential.evidenceEndHeight == null || item.sourceBlock == null) return true;
    return item.sourceBlock <= credential.evidenceEndHeight;
  });
  return matching
    .slice()
    .sort((a, b) => b.period - a.period)
    .slice(0, credential.periodsProven)
    .sort((a, b) => a.period - b.period);
}

const fatSnapshot = [
  {
    payerAddress: "0x1111111111111111111111111111111111111111",
    evidencePayer: "0x1111111111111111111111111111111111111111",
    evidence: Array.from({ length: 19 }, (_, index) => ({
      period: index + 2,
      sourceTx: `0x${(index + 1).toString(16).padStart(64, "0")}`,
      verifiedTx: `0x${(index + 2).toString(16).padStart(64, "0")}`,
      sourceBlock: 11_600_000 + index,
      attested: true,
    })),
  },
];

const credential = {
  status: "valid",
  periodsProven: 3,
  incomeBand: { id: 4, label: "$2,500 - $4,000" },
  evidencePayer: "0x1111111111111111111111111111111111111111",
  evidenceEndHeight: 11_600_018,
};

const reasons = reasonsFromCredential(credential);
assert.equal(reasons[0].detail, "3 consecutive periods verified");
assert.ok(reasons.every((row) => row.pass));

const scoped = evidenceForStatement(fatSnapshot, credential);
assert.equal(scoped.length, 3, "report must not dump the live snapshot");
assert.deepEqual(
  scoped.map((row) => row.period),
  [18, 19, 20],
);

const unknownReasons = reasonsFromCredential({
  status: "unknown",
  periodsProven: 0,
  incomeBand: null,
  evidencePayer: null,
});
assert.equal(unknownReasons.every((row) => row.pass), false);
assert.equal(
  evidenceForStatement(fatSnapshot, { ...credential, evidencePayer: "0x2222222222222222222222222222222222222222" }).length,
  0,
  "unknown payer has no invented evidence",
);

console.log("alias and report scope checks passed");
