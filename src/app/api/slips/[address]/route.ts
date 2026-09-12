import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { requireSession } from "@/lib/session-api";
import { slipBookFor } from "@/lib/slips";

/**
 * Delivers one window's payment preimages to the recipient who owns them.
 *
 * The response body is the private witness: the amounts and the salts. It
 * leaves the server exactly once, to the connected wallet, and goes no further:
 * never logged, never cached, never sent to a third party. The browser proves
 * from it locally and the server never sees the result until it is a proof.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address: raw } = await params;
  const payer = request.nextUrl.searchParams.get("payer") ?? "";

  if (!isAddress(raw)) {
    return NextResponse.json({ error: "A valid address is required." }, { status: 400 });
  }
  if (!isAddress(payer)) {
    return NextResponse.json({ error: "A valid employer is required." }, { status: 400 });
  }

  const address = raw.toLowerCase() as `0x${string}`;
  const session = requireSession(request, address);
  if (session instanceof NextResponse) return session;

  const book = await slipBookFor(address, payer);
  if (!book) {
    return NextResponse.json(
      { error: "This employer's payment records are not ready yet." },
      { status: 404 },
    );
  }

  return NextResponse.json(book, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      "Referrer-Policy": "no-referrer",
    },
  });
}
