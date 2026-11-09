import { NextResponse } from "next/server";
import { getSelectedProfileId } from "@/lib/profile-session";
import { getProfileCurrencies } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await context.params;
  const selectedProfileId = await getSelectedProfileId();
  if (!selectedProfileId || selectedProfileId !== profileId) {
    return NextResponse.json({ error: "Selecione este perfil antes de consultar o saldo." }, { status: 401 });
  }

  try {
    return NextResponse.json({ currencies: await getProfileCurrencies(selectedProfileId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o saldo do perfil.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
