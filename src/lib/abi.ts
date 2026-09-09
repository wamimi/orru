import { parseAbi } from "viem";

export const credentialRegistryAbi = parseAbi([
  "function statusOf(bytes32 credentialId) view returns (uint8)",
  "function credentialOf(bytes32 credentialId) view returns ((address subject,address evidencePayer,uint8 band,uint8 periodsProven,uint64 issuedAt,uint64 evidenceEndHeight,uint64 revokedAt,bytes32 documentHash))",
  "function nonces(address subject) view returns (uint256)",
  "function domainSeparator() view returns (bytes32)",
  "function claimKeyFor(bytes32[] publicInputs, address subject) view returns (bytes32)",
  "function PERIODS() view returns (uint256)",
  "function PUBLIC_INPUTS() view returns (uint256)",
  "function issue((bytes proof,bytes32[] publicInputs,address evidencePayer,bytes32 documentHash,uint256 deadline,bytes subjectAuthorization) req) returns (bytes32)",
  "function revoke(bytes32 credentialId)",
  "event CredentialIssued(bytes32 indexed credentialId, address indexed subject, address indexed evidencePayer, uint8 band, uint64 evidenceEndHeight, bytes32 documentHash)",
  "event CredentialRevoked(bytes32 indexed credentialId, address indexed revokedBy)",
  // Parameter types are part of a custom error's selector, so these must match
  // the contract exactly or a revert arrives undecodable and reads as a generic
  // failure. Verifier errors are included because they surface through issue().
  "error ZeroAddress()",
  "error WrongPublicInputCount(uint256 given, uint256 expected)",
  "error NonCanonicalPublicInput(uint256 index)",
  "error InvalidSubjectEncoding()",
  "error InvalidCommitmentLimb(uint256 index)",
  "error UnknownBand(uint256 band)",
  "error CommitmentNotAttestedToPayer(bytes32 commitment, address payer)",
  "error InvalidProof()",
  "error CredentialExists(bytes32 credentialId)",
  "error NoSuchCredential(bytes32 credentialId)",
  "error AlreadyRevoked(bytes32 credentialId)",
  "error NotOwnerOrSubject(address caller)",
  "error AuthorizationExpired(uint256 deadline)",
  "error InvalidSubjectAuthorization(address subject)",
  "error ProofLengthWrong()",
  "error PublicInputsLengthWrong()",
  "error SumcheckFailed()",
  "error ShpleminiFailed()",
]);

export const creditPoolAbi = parseAbi([
  "function remainingFor(bytes32 credentialId) view returns (uint256)",
  "function drawnBySubject(address subject) view returns (uint256)",
  "function limitForBand(uint8 band) pure returns (uint256)",
  "function minimumEvidenceHeight() view returns (uint64)",
  "function disburse(bytes32 credentialId, uint256 amount)",
  "event Disbursed(bytes32 indexed credentialId, address indexed subject, uint256 amount, uint256 remaining)",
  "error ZeroAmount()",
  "error CredentialNotValid(bytes32 credentialId)",
  "error UnknownBand(uint8 band)",
  "error ExceedsLimit(uint256 requested, uint256 remaining)",
  "error InsufficientLiquidity(uint256 requested, uint256 available)",
  "error EvidenceTooOld(uint64 given, uint64 minimum)",
]);

export const attestationRegistryAbi = parseAbi([
  "function acceptedByPayer(bytes32 commitment, address payer) view returns (bool)",
  "function provenAtHeight(bytes32 commitment, address payer) view returns (uint64)",
  "function approvedPayer(address payer) view returns (bool)",
  "event CommitmentAccepted(bytes32 indexed commitment, address indexed payer, bytes32 indexed queryId, uint64 blockHeight)",
]);

export const CREDENTIAL_STATUS = ["unknown", "valid", "revoked"] as const;

export type CredentialStatus = (typeof CREDENTIAL_STATUS)[number];
