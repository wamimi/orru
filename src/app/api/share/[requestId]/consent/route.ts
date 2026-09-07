import { NextRequest, NextResponse } from "next/server";
import { recordConsent } from "@/lib/share-store";
import { requireSession } from "@/lib/session-api";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const session = requireSession(request);
  if (session instanceof NextResponse) return session;

  if (!requestId) {
    return NextResponse.json({ error: "A request is required." }, { status: 400 });
  }

  const consent = recordConsent(requestId, session.address);
  return NextResponse.json({
    ok: true,
    requestId: consent.requestId,
    consentedAt: consent.consentedAt,
  });
}
