import { NextResponse } from "next/server";
import { getTraders } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const { profileId } = await context.params;
    return NextResponse.json({ traders: await getTraders(profileId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler os comerciantes.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
