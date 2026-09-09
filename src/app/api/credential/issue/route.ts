import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHex, type Hex } from "viem";
import { credentialRegistryAbi } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";
import { friendlyError } from "@/lib/errors";
import { subjectFromPublicInputs } from "@/lib/issue";
import { relayerConfigured, relayerWallet } from "@/lib/relayer";
import { requireSession } from "@/lib/session-api";

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
    // Pure over the statement and the subject, so it is known before the write.
    const credentialId = await creditcoinClient.readContract({
      address: registry,
      abi: credentialRegistryAbi,
      functionName: "claimKeyFor",
      args: [body.publicInputs, subject],
    });

    // The registry refuses a second statement over the same pay cycles. Reading
    // it here returns the id of the one that already exists, so the caller can
    // show that statement instead of an error.
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

    // Waiting is what makes the returned link work. Reporting success on the
    // submitted hash sends the user to a page the chain has not written yet.
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

    return NextResponse.json({
      credentialId,
      txHash,
      status: "issued",
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  }
}
