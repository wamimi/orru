import { NextRequest, NextResponse } from "next/server";
import { getAddress, verifyMessage } from "viem";
import {
  issueSession,
  normalizeAddress,
  readChallenge,
  sessionCookieName,
} from "@/lib/auth";

export async function POST(request: NextRequest) {
  let body: { address?: string; signature?: string; challenge?: string };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const address = body.address ? normalizeAddress(body.address) : null;
  const signature = body.signature;
  const challenge = body.challenge;
  if (!address || !signature || !challenge) {
    return NextResponse.json(
      { error: "Address, signature, and challenge are required." },
      { status: 400 },
    );
  }

  const issued = readChallenge(challenge);
  if (!issued || issued.address !== address) {
    return NextResponse.json(
      { error: "This message is no longer valid. Ask for a new one." },
      { status: 400 },
    );
  }

  let matches = false;
  try {
    matches = await verifyMessage({
      address: getAddress(address),
      message: issued.message,
      signature: signature as `0x${string}`,
    });
  } catch {
    matches = false;
  }

  if (!matches) {
    return NextResponse.json(
      { error: "The signature does not match this address." },
      { status: 400 },
    );
  }

  let sessionToken: string;
  try {
    sessionToken = issueSession(address);
  } catch {
    return NextResponse.json(
      { error: "The sign-in service is not configured." },
      { status: 503 },
    );
  }

  const response = NextResponse.json({ ok: true, sessionToken });
  response.cookies.set(sessionCookieName, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
