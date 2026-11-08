import { NextResponse } from "next/server";
import { getIntegrationStatus } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    integration: await getIntegrationStatus(),
  });
}
