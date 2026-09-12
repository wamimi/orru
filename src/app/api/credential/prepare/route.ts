import { readFileSync } from "node:fs";
import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHex, type Hex } from "viem";
import {
  buildIssueTypedData,
  serializeTypedData,
  subjectFromPublicInputs,
  ZERO_BYTES32,
  type ProofBundle,
} from "@/lib/issue";
import { PUBLIC_INPUTS } from "@/lib/prove/types";
import { requireSession } from "@/lib/session-api";
import { findProofBundlePath } from "@/lib/snapshot";

type PrepareBody = {
  proof?: Hex;
  publicInputs?: Hex[];
  evidencePayer?: `0x${string}`;
};

/**
 * Builds the authorization the subject signs, over a statement their own
 * browser produced.
 *
 * The server never sees the amounts, only the finished statement, which is
 * public by the time it reaches the chain. It reads the on-chain nonce, which
 * is the one thing the browser cannot supply for itself.
 */
export async function POST(request: NextRequest) {
  const session = requireSession(request);
  if (session instanceof NextResponse) return session;

  let body: PrepareBody;
  try {
    body = (await request.json()) as PrepareBody;
  } catch {
    return NextResponse.json({ error: "A statement request is required." }, { status: 400 });
  }

  if (
    !body.proof ||
    !isHex(body.proof) ||
    !Array.isArray(body.publicInputs) ||
    body.publicInputs.length !== PUBLIC_INPUTS ||
    !body.publicInputs.every((value) => isHex(value) && value.length === 66) ||
    !body.evidencePayer ||
    !isAddress(body.evidencePayer)
  ) {
    return NextResponse.json({ error: "The statement request is incomplete." }, { status: 400 });
  }

  let subject: `0x${string}`;
  try {
    subject = subjectFromPublicInputs(body.publicInputs);
  } catch {
    return NextResponse.json({ error: "The statement request is incomplete." }, { status: 400 });
  }

  // The subject is inside the statement itself, so a statement built for
  // someone else cannot be authorized from this session.
  if (subject.toLowerCase() !== session.address) {
    return NextResponse.json(
      { error: "That statement does not match the connected address." },
      { status: 403 },
    );
  }

  const typed = await buildIssueTypedData(
    {
      subject,
      evidencePayer: body.evidencePayer,
      proof: body.proof,
      publicInputs: body.publicInputs,
    },
    ZERO_BYTES32,
  );

  return NextResponse.json({ typedData: serializeTypedData(typed) });
}

/**
 * The pre-built statement for one address.
 *
 * Superseded by browser proving, which is the only path that keeps the amounts
 * on the user's machine. Kept as a deliberate fallback: set
 * NEXT_PUBLIC_ORRU_PREBUILT=1 and the flow says on screen that it is in use.
 */
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
