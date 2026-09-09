import { concat, keccak256, type Hex } from "viem";
import { credentialRegistryAbi } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";
import type { ProofBundle } from "@/lib/issue-types";

export type { ProofBundle } from "@/lib/issue-types";

export const ZERO_BYTES32 = `0x${"00".repeat(32)}` as Hex;

export function publicInputsHash(publicInputs: Hex[]): Hex {
  return keccak256(concat(publicInputs));
}

export function subjectFromPublicInputs(publicInputs: Hex[]): `0x${string}` {
  const first = publicInputs[0];
  if (!first || first.length < 42) {
    throw new Error("publicInputs[0] is missing the subject");
  }
  return `0x${first.slice(-40)}` as `0x${string}`;
}

/** Everything the authorization binds. A full bundle satisfies it. */
export type IssueSubject = Pick<
  ProofBundle,
  "subject" | "evidencePayer" | "proof" | "publicInputs"
>;

export async function buildIssueTypedData(
  bundle: IssueSubject,
  documentHash: Hex = ZERO_BYTES32,
) {
  const verifyingContract = ADDRESSES[CREDITCOIN_ID].credentialRegistry;

  const nonce = await creditcoinClient.readContract({
    address: verifyingContract,
    abi: credentialRegistryAbi,
    functionName: "nonces",
    args: [bundle.subject],
  });

  return {
    domain: {
      name: "Orru",
      version: "1",
      chainId: CREDITCOIN_ID,
      verifyingContract,
    },
    types: {
      Issue: [
        { name: "proofHash", type: "bytes32" },
        { name: "publicInputsHash", type: "bytes32" },
        { name: "evidencePayer", type: "address" },
        { name: "documentHash", type: "bytes32" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
      ],
    },
    primaryType: "Issue" as const,
    message: {
      proofHash: keccak256(bundle.proof),
      publicInputsHash: publicInputsHash(bundle.publicInputs),
      evidencePayer: bundle.evidencePayer,
      documentHash,
      nonce,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    },
  };
}

export function serializeTypedData(typed: Awaited<ReturnType<typeof buildIssueTypedData>>) {
  return {
    ...typed,
    message: {
      ...typed.message,
      nonce: typed.message.nonce.toString(),
      deadline: typed.message.deadline.toString(),
    },
  };
}
