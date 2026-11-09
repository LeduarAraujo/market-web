import { NextResponse } from "next/server";
import { getSelectedProfileId } from "@/lib/profile-session";
import { getTraders } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await context.params;
  const selectedProfileId = await getSelectedProfileId();
  if (!selectedProfileId || selectedProfileId !== profileId) {
    return NextResponse.json({ error: "Selecione este perfil antes de consultar os comerciantes." }, { status: 401 });
  }

  try {
    return NextResponse.json({ traders: await getTraders(selectedProfileId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler os comerciantes.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
