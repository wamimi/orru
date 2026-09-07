import { parseAbi } from "viem"

export const payerAnchorAbi = parseAbi([
  "event PaymentAnchored(address indexed payer, bytes32 indexed commitment)",
  "function anchoredBy(address payer, bytes32 commitment) view returns (bool)",
])

export const demoPayrollAbi = parseAbi([
  "event PaymentMade(address indexed recipient, uint256 amount, uint256 indexed period, bytes32 salt, bytes32 indexed commitment)",
  "event PayrollRun(uint256 indexed period, uint256 paid, uint256 eligible)",
  "function anchor() view returns (address)",
  "function currentPeriod() view returns (uint256)",
  "function lastPaidPeriod() view returns (uint256)",
])

export const attestationRegistryAbi = parseAbi([
  "function execute(uint8 action, uint64 chainKey, uint64 blockHeight, bytes encodedTransaction, bytes32 merkleRoot, (bytes32 hash, bool isLeft)[] siblings, bytes32 lowerEndpointDigest, bytes32[] continuityRoots) returns (bool success)",
  "function acceptedCommitment(bytes32 commitment) view returns (bool)",
  "function acceptedByPayer(bytes32 commitment, address payer) view returns (bool)",
  "function provenAtHeight(bytes32 commitment, address payer) view returns (uint64)",
  "function approvedPayer(address payer) view returns (bool)",
  "function processedQueries(bytes32 queryId) view returns (bool)",
  "function SOURCE_CHAIN_KEY() view returns (uint64)",
  "function TRUSTED_ANCHOR() view returns (address)",
])

export const credentialRegistryAbi = parseAbi([
  "function PERIODS() view returns (uint256)",
  "function PUBLIC_INPUTS() view returns (uint256)",
  "function BAND_COUNT() view returns (uint256)",
  "function nonces(address subject) view returns (uint256)",
  "function domainSeparator() view returns (bytes32)",
  "function claimKeyFor(bytes32[] publicInputs, address subject) view returns (bytes32)",
  "function statusOf(bytes32 credentialId) view returns (uint8)",
])

/// The ABI string ethers needs for `execute`. Kept beside the viem version so
/// the tuple shape cannot drift between the two libraries.
export const EXECUTE_SIGNATURE =
  "function execute(uint8 action,uint64 chainKey,uint64 blockHeight,bytes encodedTransaction,bytes32 merkleRoot,(bytes32 hash,bool isLeft)[] siblings,bytes32 lowerEndpointDigest,bytes32[] continuityRoots) returns (bool success)"
