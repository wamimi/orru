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

  try {
    const wallet = relayerWallet();
    const txHash = await wallet.writeContract({
      address: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
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

    const credentialId = await creditcoinClient.readContract({
      address: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
      abi: credentialRegistryAbi,
      functionName: "claimKeyFor",
      args: [body.publicInputs, subject],
    });

    return NextResponse.json({
      credentialId,
      txHash,
      status: "issued",
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  }
}
