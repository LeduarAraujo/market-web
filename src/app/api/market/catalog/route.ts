import { NextResponse } from "next/server";
import { getSelectedProfileId } from "@/lib/profile-session";
import { getFleaCatalog } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await getSelectedProfileId())) {
    return NextResponse.json({ error: "Selecione um perfil antes de consultar o catálogo." }, { status: 401 });
  }

  try {
    return NextResponse.json(await getFleaCatalog());
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível carregar o catálogo do flea.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
