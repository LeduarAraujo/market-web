import { NextResponse } from "next/server";
import { getSelectedProfileId } from "@/lib/profile-session";
import { getLockedTraderOffers } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const templateIdPattern = /^[a-f\d]{24}$/i;

export async function GET(request: Request) {
  const profileId = await getSelectedProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selecione um perfil antes de consultar as ofertas." }, { status: 401 });
  }

  const templateId = new URL(request.url).searchParams.get("templateId");
  if (templateId === null || !templateIdPattern.test(templateId)) {
    return NextResponse.json({ error: "Informe um ID de item válido." }, { status: 400 });
  }

  try {
    const offers = await getLockedTraderOffers(profileId, templateId);
    return NextResponse.json({ offers }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar as ofertas bloqueadas.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
