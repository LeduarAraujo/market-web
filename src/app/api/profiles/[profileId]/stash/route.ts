import { NextResponse } from "next/server";
import { getStash } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const { profileId } = await context.params;
    return NextResponse.json({ items: await getStash(profileId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o stash.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
