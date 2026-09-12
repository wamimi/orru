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
    const [payrollResult, claimedResult] = await Promise.allSettled([
      deriveIncome(address),
      faucetConfigured()
        ? import("@/lib/faucet-income").then((m) => m.faucetIncome(address))
        : Promise.resolve(null),
    ]);

    const payroll =
      payrollResult.status === "fulfilled" ? payrollResult.value : null;
    const claimed =
      claimedResult.status === "fulfilled" ? claimedResult.value : null;

    // Chain-derived rows replace snapshot rows per payer; the snapshot only
    // supplies payers the chain cannot describe.
    const live = [payroll, claimed].filter((row) => row !== null);
    const covered = new Set(live.map((row) => row.payerAddress.toLowerCase()));

    let stale: ReturnType<typeof incomesForAddress> = [];
    let snapshotFailed = false;
    try {
      stale = (snapshotAvailable() ? incomesForAddress(address) : []).filter(
        (row) => !covered.has(row.payerAddress.toLowerCase()),
      );
    } catch {
      snapshotFailed = true;
    }

    // A temporary failure in one discovery source must not discard a valid row
    // returned by the other one. If neither source returned anything, however,
    // report the failed read instead of presenting it as an empty history.
    if (
      live.length === 0 &&
      stale.length === 0 &&
      (payrollResult.status === "rejected" ||
        claimedResult.status === "rejected" ||
        snapshotFailed)
    ) {
      console.error("[orru] income lookup had no usable source", {
        payroll: payrollResult.status,
        faucet: claimedResult.status,
        snapshot: snapshotFailed ? "rejected" : "fulfilled",
      });
      return NextResponse.json(
        { error: "Income records are not available yet." },
        { status: 503 },
      );
    }

    return NextResponse.json({ address, incomes: [...live, ...stale] });
  } catch (error) {
    console.error(
      "[orru] income route failed",
      error instanceof Error ? error.name : "UnknownError",
    );
    return NextResponse.json(
      { error: "Income records are not available yet." },
      { status: 503 },
    );
  }
}
