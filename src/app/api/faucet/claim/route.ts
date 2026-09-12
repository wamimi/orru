import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { friendlyError } from "@/lib/errors";
import {
  anchorClaim,
  FaucetMisconfigured,
  FaucetUnfunded,
  faucetConfigured,
  faucetStatus,
} from "@/lib/faucet";
import { requireSession } from "@/lib/session-api";

/** Concurrency guard within one instance. The session is the real gate. */
const inFlight = new Set<string>();

export async function POST(request: NextRequest) {
  if (!faucetConfigured()) {
    return NextResponse.json(
      { error: "The demo payer is not available right now." },
      { status: 503 },
    );
  }

  let address: string;
  try {
    address = ((await request.json()) as { address?: string }).address ?? "";
  } catch {
    return NextResponse.json({ error: "An address is required." }, { status: 400 });
  }

  if (!isAddress(address)) {
    return NextResponse.json({ error: "That is not a valid address." }, { status: 400 });
  }

  const session = requireSession(request, address);
  if (session instanceof NextResponse) return session;

  const key = address.toLowerCase();
  if (inFlight.has(key)) {
    return NextResponse.json(
      { error: "That claim is already being sent. Give it a moment." },
      { status: 429 },
    );
  }

  inFlight.add(key);
  try {
    // Anchoring twice reverts, so an existing claim returns its status.
    const txHash = await anchorClaim(address);
    const status = await faucetStatus(address, txHash ?? undefined);

    return NextResponse.json({ ...status, txHash, pending: Boolean(txHash) && !status.anchored });
  } catch (error) {
    if (error instanceof FaucetUnfunded) {
      console.error(`[orru] faucet payer ${error.payer} is out of Sepolia ETH`);
      return NextResponse.json(
        { error: "The demo payer has run dry. Please tell us. This is our problem, not yours." },
        { status: 503 },
      );
    }
    if (error instanceof FaucetMisconfigured) {
      console.error(`[orru] ${error.message}`);
      return NextResponse.json(
        { error: "The demo payer is misconfigured. Please tell us." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: friendlyError(error) }, { status: 400 });
  } finally {
    inFlight.delete(key);
  }
}
