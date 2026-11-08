import { NextResponse } from "next/server";
import { listProfiles } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ profiles: await listProfiles() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler os perfis SPT.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
