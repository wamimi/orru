import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHex, type Hex } from "viem";
import { credentialRegistryAbi } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";
import { friendlyError } from "@/lib/errors";
import { registerAlias } from "@/lib/alias-store";
import { subjectFromPublicInputs } from "@/lib/issue";
import { relayerConfigured, relayerWallet } from "@/lib/relayer";
import { requireSession } from "@/lib/session-api";
import { forgetStatements } from "@/lib/statements";

type IssueBody = {
  proof?: Hex;
  publicInputs?: Hex[];
  evidencePayer?: `0x${string}`;
  documentHash?: Hex;
  deadline?: string;
  subjectAuthorization?: Hex;
};

export async function POST(request: NextRequest) {
  const session = requireSession(request);
  if (session instanceof NextResponse) return session;

  if (!relayerConfigured()) {
    return NextResponse.json(
      { error: "Issuing is not available yet." },
      { status: 503 },
    );
  }

  let body: IssueBody;
  try {
    body = (await request.json()) as IssueBody;
  } catch {
    return NextResponse.json({ error: "A statement request is required." }, { status: 400 });
  }

  if (
    !body.proof ||
    !isHex(body.proof) ||
    !Array.isArray(body.publicInputs) ||
    !body.evidencePayer ||
    !isAddress(body.evidencePayer) ||
    !body.documentHash ||
    !body.deadline ||
    !body.subjectAuthorization
  ) {
    return NextResponse.json({ error: "The statement request is incomplete." }, { status: 400 });
  }

  let subject: `0x${string}`;
  try {
    subject = subjectFromPublicInputs(body.publicInputs);
  } catch {
    return NextResponse.json({ error: "The statement request is incomplete." }, { status: 400 });
  }

  if (subject.toLowerCase() !== session.address) {
    return NextResponse.json(
      { error: "That signature didn't match this wallet." },
      { status: 403 },
    );
  }

  const registry = ADDRESSES[CREDITCOIN_ID].credentialRegistry;

  try {
    const credentialId = await creditcoinClient.readContract({
      address: registry,
      abi: credentialRegistryAbi,
      functionName: "claimKeyFor",
      args: [body.publicInputs, subject],
    });

    // A second statement over the same cycles is refused; return the existing id.
    const existing = await creditcoinClient.readContract({
      address: registry,
      abi: credentialRegistryAbi,
      functionName: "statusOf",
      args: [credentialId],
    });
    if (Number(existing) !== 0) {
      return NextResponse.json(
        { error: "You already have a statement for these pay cycles.", credentialId },
        { status: 409 },
      );
    }

    const wallet = relayerWallet();
    const { request } = await creditcoinClient.simulateContract({
      account: wallet.account,
      address: registry,
      abi: credentialRegistryAbi,
      functionName: "issue",
      args: [
        {
          proof: body.proof,
          publicInputs: body.publicInputs,
          evidencePayer: body.evidencePayer,
          documentHash: body.documentHash,
          deadline: BigInt(body.deadline),
          subjectAuthorization: body.subjectAuthorization,
        },
      ],
    });
    const txHash = await wallet.writeContract(request);

    const receipt = await creditcoinClient.waitForTransactionReceipt({
      hash: txHash,
      timeout: 60_000,
    });
    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "Your statement could not be written. Please try again.", txHash },
        { status: 400 },
      );
    }

    forgetStatements(subject);

    const alias = registerAlias(credentialId);

    return NextResponse.json({
      credentialId,
      alias,
      txHash,
      status: "issued",
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  }
}
