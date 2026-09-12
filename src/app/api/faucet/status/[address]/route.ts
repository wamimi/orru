import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHash, type Hex } from "viem";
import { faucetConfigured, faucetStatus } from "@/lib/faucet";
import { requireSession } from "@/lib/session-api";

/**
 * Gated to the address being asked about. Claim salts are secret, so an
 * anchored commitment cannot be linked back to a recipient on chain, leaving
 * this open would answer that question for any address anyone named.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "That is not a valid address." }, { status: 400 });
  }

  const txHash = request.nextUrl.searchParams.get("txHash");
  if (txHash && !isHash(txHash)) {
    return NextResponse.json(
      { error: "That is not a valid transaction." },
      { status: 400 },
    );
  }
  if (!faucetConfigured()) {
    return NextResponse.json(
      { error: "The demo payer is not available right now." },
      { status: 503 },
    );
  }

  const session = requireSession(request, address);
  if (session instanceof NextResponse) return session;

  try {
    return NextResponse.json(
      await faucetStatus(address, (txHash as Hex | null) ?? undefined),
    );
  } catch {
    return NextResponse.json(
      { error: "That could not be checked right now." },
      { status: 503 },
    );
  }
}
