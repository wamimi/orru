import { NextResponse } from "next/server";
import { buildReport } from "@/lib/report";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const report = await buildReport(id);
    return NextResponse.json(report);
  } catch {
    return NextResponse.json(
      { error: "This report could not be read." },
      { status: 502 },
    );
  }
}
