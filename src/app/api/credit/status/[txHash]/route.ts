import { NextRequest, NextResponse } from "next/server";
import { isHash, TransactionReceiptNotFoundError, type Hex } from "viem";
import { creditcoinClient } from "@/lib/clients";
import { requireSession } from "@/lib/session-api";
import { forgetStatements } from "@/lib/statements";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ txHash: string }> },
) {
  const session = requireSession(request);
  if (session instanceof NextResponse) return session;

  const { txHash } = await params;
  if (!isHash(txHash)) {
    return NextResponse.json({ error: "A valid confirmation id is required." }, { status: 400 });
  }

  try {
    const receipt = await creditcoinClient.getTransactionReceipt({ hash: txHash as Hex });
    if (receipt.status !== "success") {
      return NextResponse.json({ status: "failed", txHash });
    }

    forgetStatements(session.address);
    return NextResponse.json({
      status: "confirmed",
      txHash,
      blockNumber: receipt.blockNumber.toString(),
    });
  } catch (error) {
    if (error instanceof TransactionReceiptNotFoundError) {
      return NextResponse.json({ status: "pending", txHash }, { status: 202 });
    }
    return NextResponse.json(
      { error: "The confirmation could not be read right now." },
      { status: 503 },
    );
  }
}
