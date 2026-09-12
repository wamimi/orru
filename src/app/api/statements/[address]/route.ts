import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireSession } from "@/lib/session-api";
import { statementsFor } from "@/lib/statements";

/** Everything the dashboard shows, for the connected wallet only. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "A valid address is required." }, { status: 400 });
  }
  const address = raw.toLowerCase() as `0x${string}`;
  const session = requireSession(request, address);
  if (session instanceof NextResponse) return session;

  try {
    return NextResponse.json(await statementsFor(raw as `0x${string}`));
  } catch {
    return NextResponse.json(
      { error: "Your statements could not be read right now." },
      { status: 503 },
    );
  }
}
