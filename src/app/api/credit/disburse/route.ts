import { NextRequest, NextResponse } from "next/server";
import { isHex } from "viem";
import { creditPoolAbi } from "@/lib/abi";
import { ADDRESSES, CREDITCOIN_ID } from "@/lib/chain";
import { creditcoinClient } from "@/lib/clients";
import { friendlyError } from "@/lib/errors";
import { relayerConfigured, relayerWallet } from "@/lib/relayer";
import { requireSession } from "@/lib/session-api";

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

    return NextResponse.json({
      credentialId: body.credentialId,
      amount: amount.toString(),
      remaining: remaining.toString(),
      txHash,
    });
  } catch (error) {
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  }
}
