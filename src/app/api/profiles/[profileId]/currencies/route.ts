import { NextResponse } from "next/server";
import { getProfileCurrencies } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  try {
    const { profileId } = await context.params;
    return NextResponse.json({ currencies: await getProfileCurrencies(profileId) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler o saldo do perfil.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
