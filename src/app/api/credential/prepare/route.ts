import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import {
  buildIssueTypedData,
  serializeTypedData,
  ZERO_BYTES32,
  type ProofBundle,
} from "@/lib/issue";
import { requireSession } from "@/lib/session-api";
import { findProofBundlePath } from "@/lib/snapshot";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("address") ?? "";
  if (!isAddress(raw)) {
    return NextResponse.json({ error: "A valid address is required." }, { status: 400 });
  }
  const address = raw.toLowerCase() as `0x${string}`;
  const session = requireSession(request, address);
  if (session instanceof NextResponse) return session;

  const path = findProofBundlePath(raw) ?? findProofBundlePath(address);
  if (!path) {
    return NextResponse.json(
      { error: "Checking your income is not ready yet." },
      { status: 404 },
    );
  }

  try {
    const bundle = JSON.parse(readFileSync(path, "utf8")) as ProofBundle;
    if (bundle.subject.toLowerCase() !== address) {
      return NextResponse.json(
        { error: "This statement does not match the connected address." },
        { status: 403 },
      );
    }
    const typed = await buildIssueTypedData(bundle, ZERO_BYTES32);
    return NextResponse.json({
      bundle,
      typedData: serializeTypedData(typed),
    });
  } catch {
    return NextResponse.json(
      { error: "Checking your income is not ready yet." },
      { status: 503 },
    );
  }
}
