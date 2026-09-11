import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireSession } from "@/lib/session-api";
import { deriveIncome } from "@/lib/live-income";
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

  try {
    const { faucetConfigured } = await import("@/lib/faucet");
    const [payroll, claimed] = await Promise.all([
      deriveIncome(address),
      faucetConfigured()
        ? import("@/lib/faucet-income").then((m) => m.faucetIncome(address))
        : Promise.resolve(null),
    ]);

    // Chain-derived rows replace snapshot rows per payer; the snapshot only
    // supplies payers the chain cannot describe.
    const live = [payroll, claimed].filter((row) => row !== null);
    const covered = new Set(live.map((row) => row.payerAddress.toLowerCase()));

    const stale = (snapshotAvailable() ? incomesForAddress(address) : []).filter(
      (row) => !covered.has(row.payerAddress.toLowerCase()),
    );

    return NextResponse.json({ address, incomes: [...live, ...stale] });
  } catch {
    return NextResponse.json(
      { error: "Income records are not available yet." },
      { status: 503 },
    );
  }
}
