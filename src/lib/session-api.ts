import { NextRequest, NextResponse } from "next/server";
import { readSession, sessionCookieName } from "@/lib/auth";

export function sessionFromRequest(request: NextRequest): `0x${string}` | null {
  const bearer = request.headers.get("authorization");
  const token = bearer?.startsWith("Bearer ")
    ? bearer.slice(7)
    : request.cookies.get(sessionCookieName)?.value;
  return readSession(token);
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "Sign the short message before we look anything up." },
    { status: 401 },
  );
}

export function requireSession(
  request: NextRequest,
  address?: string,
): { address: `0x${string}` } | NextResponse {
  const session = sessionFromRequest(request);
  if (!session) return unauthorized();
  if (address && session !== address.toLowerCase()) return unauthorized();
  return { address: session };
}
