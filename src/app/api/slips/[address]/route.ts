import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireSession } from "@/lib/session-api";
import { findSlipsPath } from "@/lib/snapshot";

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

  const path = findSlipsPath(raw) ?? findSlipsPath(address);
  if (!path) {
    return NextResponse.json({ error: "Slips are not available yet." }, { status: 404 });
  }

  try {
    const body = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return NextResponse.json(body);
  } catch {
    return NextResponse.json({ error: "Slips are not available yet." }, { status: 404 });
  }
}
