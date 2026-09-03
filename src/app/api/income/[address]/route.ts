import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { readSession, sessionCookieName } from "@/lib/auth";
import { lookupIncome } from "@/lib/income";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "A valid address is required." }, { status: 400 });
  }
  const address = raw.toLowerCase() as `0x${string}`;

  const bearer = request.headers.get("authorization");
  const token =
    bearer?.startsWith("Bearer ") ? bearer.slice(7) : request.cookies.get(sessionCookieName)?.value;
  const sessionAddress = readSession(token);
  if (!sessionAddress || sessionAddress !== address) {
    return NextResponse.json(
      { error: "Sign the short message before we look anything up." },
      { status: 401 },
    );
  }

  try {
    const income = await lookupIncome(address);
    return NextResponse.json({
      verified: income.verified,
      reason: income.reason,
      payerName: income.payerName,
      payerAddress: income.payerAddress,
      payerTier: income.payerTier,
      periodsVerified: income.periodsVerified,
      periodsConsecutive: income.periodsConsecutive,
      firstPeriod: income.firstPeriod,
      latestPeriod: income.latestPeriod,
      incomeBand: income.incomeBand,
      evidence: income.evidence.map((row) => ({
        period: row.period,
        sourceChain: row.sourceChain,
        sourceTx: row.sourceTx,
        verifiedTx: row.verifiedTx,
        verifiedAt: row.verifiedAt,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "Payments could not be confirmed." },
      { status: 502 },
    );
  }
}
