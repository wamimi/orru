/**
 * Offline checks for the live-contract integration.
 * Does not send transactions.
 */
import { readFileSync } from "node:fs";
import { concat, encodeAbiParameters, keccak256 } from "viem";

const snapshot = JSON.parse(
  readFileSync("fixtures/income-snapshot.json", "utf8"),
);

const you = "0xf6A48D18DA6072eaDdBF5D2BfB9FE9263dE0b66C".toLowerCase();
const yours = snapshot.recipients.filter((row) => row.address.toLowerCase() === you);
const payroll = yours.find((row) => row.verified && row.provableWindow);
if (!payroll) throw new Error("expected a verified Demo Payroll row for the attested wallet");
if (payroll.incomeBand.id !== 4) throw new Error(`expected band 4, got ${payroll.incomeBand.id}`);
if (!payroll.provableWindow || payroll.provableWindow.from !== 18 || payroll.provableWindow.to !== 20) {
  throw new Error(`expected provable window 18-20, got ${JSON.stringify(payroll.provableWindow)}`);
}

const multi = snapshot.recipients.filter((row) =>
  row.address.toLowerCase().startsWith("0xbb605cf7"),
);
if (multi.length !== 2) throw new Error(`expected 2 payer rows, got ${multi.length}`);
const names = new Set(multi.map((row) => row.payerName));
if (!names.has("Orru Demo Payroll") || !names.has("Semuni")) {
  throw new Error("multi-payer rows must stay unmerged");
}
if (multi[0].incomeBand.id === multi[1].incomeBand.id) {
  throw new Error("the two payers must keep different bands");
}

const publicInputs = [
  "0x000000000000000000000000f6a48d18da6072eaddbf5d2bfb9fe9263de0b66c",
  "0x0000000000000000000000000000000000000000000000000000000000000004",
];
const packed = keccak256(concat(publicInputs));
const abiEncoded = keccak256(
  encodeAbiParameters([{ type: "bytes32[]" }], [publicInputs]),
);
if (packed === abiEncoded) {
  throw new Error("publicInputsHash must be concat, not ABI-encoded");
}
if (packed.length !== 66) throw new Error("publicInputsHash must be bytes32");

const proof = JSON.parse(
  readFileSync("fixtures/proof-f6A48D18-payroll-band4.json", "utf8"),
);
if (proof.subject.toLowerCase() !== you) {
  throw new Error("proof subject must be the attested wallet");
}
if (!proof.proof || !Array.isArray(proof.publicInputs) || proof.publicInputs.length !== 8) {
  throw new Error("proof bundle shape is incomplete");
}

console.log("integration checks passed");
console.log("  attested wallet band", payroll.incomeBand.label);
  console.log("  proof file periods", proof.periods.join("-"));
console.log("  multi-payer rows", [...names].join(" + "));
console.log("  publicInputsHash (concat)", packed);
