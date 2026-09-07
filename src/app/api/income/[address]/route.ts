import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireSession } from "@/lib/session-api";
import { incomesForAddress, snapshotAvailable } from "@/lib/snapshot";

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

  if (!snapshotAvailable()) {
    return NextResponse.json(
      { error: "Income records are not available yet." },
      { status: 503 },
    );
  }

  try {
    const incomes = incomesForAddress(address);
    return NextResponse.json({ address, incomes });
  } catch {
    return NextResponse.json(
      { error: "Income records are not available yet." },
      { status: 503 },
    );
  }
}
