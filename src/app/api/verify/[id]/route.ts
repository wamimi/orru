import { NextResponse } from "next/server";
import { readCredential } from "@/lib/verify";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const payload = await readCredential(id);
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json(
      { error: "This statement could not be read." },
      { status: 502 },
    );
  }
}
