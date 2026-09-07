import { NextRequest, NextResponse } from "next/server";
import { buildChallenge, normalizeAddress } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("address");
  const address = raw ? normalizeAddress(raw) : null;
  if (!address) {
    return NextResponse.json({ error: "A valid address is required." }, { status: 400 });
  }

  try {
    const { message, challenge } = buildChallenge(address);
    return NextResponse.json({ message, challenge });
  } catch {
    return NextResponse.json(
      { error: "The sign-in service is not configured." },
      { status: 503 },
    );
  }
}
