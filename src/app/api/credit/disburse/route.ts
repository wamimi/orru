import { NextRequest, NextResponse } from "next/server";
import { isHex } from "viem";
import { credentialRegistryAbi, creditPoolAbi } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";
import { friendlyError } from "@/lib/errors";
import { relayerConfigured, relayerWallet } from "@/lib/relayer";
import { requireSession } from "@/lib/session-api";
import { forgetStatements } from "@/lib/statements";

type Body = {
  credentialId?: `0x${string}`;
  amount?: string;
};

export async function POST(request: NextRequest) {
  const session = requireSession(request);
  if (session instanceof NextResponse) return session;

  if (!relayerConfigured()) {
    return NextResponse.json({ error: "This transfer is not available yet." }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "A statement id is required." }, { status: 400 });
  }

  if (!body.credentialId || !isHex(body.credentialId) || body.credentialId.length !== 66) {
    return NextResponse.json({ error: "A statement id is required." }, { status: 400 });
  }

  try {
    // Stops one session spending another subject's headroom.
    const record = await creditcoinClient.readContract({
      address: ADDRESSES[CREDITCOIN_ID].credentialRegistry,
      abi: credentialRegistryAbi,
      functionName: "credentialOf",
      args: [body.credentialId],
    });
    if (record.subject.toLowerCase() !== session.address) {
      return NextResponse.json(
        { error: "That statement belongs to a different account." },
        { status: 403 },
      );
    }

    const remaining = await creditcoinClient.readContract({
      address: ADDRESSES[CREDITCOIN_ID].creditPool,
      abi: creditPoolAbi,
      functionName: "remainingFor",
      args: [body.credentialId],
    });
    const amount = body.amount ? BigInt(body.amount) : remaining;
    if (amount <= BigInt(0)) {
      return NextResponse.json({ error: "The most available right now is 0." }, { status: 400 });
    }

    const txHash = await relayerWallet().writeContract({
      address: ADDRESSES[CREDITCOIN_ID].creditPool,
      abi: creditPoolAbi,
      functionName: "disburse",
      args: [body.credentialId, amount],
    });

    // A timeout leaves the transaction in flight; a retry would pay twice.
    let receipt;
    try {
      receipt = await creditcoinClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: 60_000,
      });
    } catch {
      return NextResponse.json(
        {
          status: "pending",
          credentialId: body.credentialId,
          amount: amount.toString(),
          txHash,
        },
        { status: 202 },
      );
    }

    if (receipt.status !== "success") {
      return NextResponse.json(
        { error: "The payment could not be completed. Please try again.", txHash },
        { status: 400 },
      );
    }

    const left = await creditcoinClient.readContract({
      address: ADDRESSES[CREDITCOIN_ID].creditPool,
      abi: creditPoolAbi,
      functionName: "remainingFor",
      args: [body.credentialId],
    });

    forgetStatements(session.address);

    return NextResponse.json({
      credentialId: body.credentialId,
      amount: amount.toString(),
      remaining: left.toString(),
      txHash,
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  }
}
