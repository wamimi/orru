/**
 * Live Creditcoin reads. No writes.
 */
import { createPublicClient, http, isHex } from "viem";
import { readFileSync } from "node:fs";

const deployments = JSON.parse(readFileSync("contracts/deployments/102031.json", "utf8"));
const registry = deployments.CredentialRegistry;

const client = createPublicClient({
  transport: http("https://rpc.cc3-testnet.creditcoin.network"),
});

const unknownId = `0x${"ab".repeat(32)}`;
const garbage = "not-an-id";

const statusOf = {
  type: "function",
  name: "statusOf",
  stateMutability: "view",
  inputs: [{ name: "credentialId", type: "bytes32" }],
  outputs: [{ name: "", type: "uint8" }],
};

const unknown = await client.readContract({
  address: registry,
  abi: [statusOf],
  functionName: "statusOf",
  args: [unknownId],
});

if (Number(unknown) !== 0) {
  throw new Error(`garbage id should be unknown, got ${unknown}`);
}

if (isHex(garbage) && garbage.length === 66) {
  throw new Error("sanity");
}

console.log("live verify reads");
console.log("  registry", registry);
console.log("  unknown id status", Number(unknown), "(0 = unknown)");
