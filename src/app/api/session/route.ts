import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSelectedProfileId, isValidProfileId, profileSessionCookieName } from "@/lib/profile-session";
import { listProfiles } from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const cookieOptions = {
  httpOnly: true,
  sameSite: "strict" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

export async function GET() {
  try {
    const profileId = await getSelectedProfileId();
    if (!profileId) return NextResponse.json({ profileId: null });

    const profileExists = (await listProfiles()).some((profile) => profile.id === profileId);
    if (!profileExists) {
      const cookieStore = await cookies();
      cookieStore.delete(profileSessionCookieName);
      return NextResponse.json({ profileId: null });
    }

    return NextResponse.json({ profileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível ler a sessão local.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const requestUrl = new URL(request.url);
      const host = request.headers.get("host");
      const expectedOrigin = host ? new URL(`${requestUrl.protocol}//${host}`).origin : requestUrl.origin;
      if (new URL(origin).origin !== expectedOrigin) {
        return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    }
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  const profileId =
    typeof body === "object" && body !== null && "profileId" in body
      ? body.profileId
      : undefined;
  if (!isValidProfileId(profileId)) {
    return NextResponse.json({ error: "Selecione um perfil SPT válido." }, { status: 400 });
  }

  try {
    const profileExists = (await listProfiles()).some((profile) => profile.id === profileId);
    if (!profileExists) {
      return NextResponse.json({ error: "O perfil selecionado não está disponível." }, { status: 404 });
    }

    const cookieStore = await cookies();
    cookieStore.set(profileSessionCookieName, profileId, cookieOptions);
    return NextResponse.json({ profileId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível abrir o perfil.";
    return NextResponse.json({ error: message }, { status: 503 });
  }
}

export async function DELETE(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const requestUrl = new URL(request.url);
      const host = request.headers.get("host");
      const expectedOrigin = host ? new URL(`${requestUrl.protocol}//${host}`).origin : requestUrl.origin;
      if (new URL(origin).origin !== expectedOrigin) {
        return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
    }
  }

  const cookieStore = await cookies();
  cookieStore.delete(profileSessionCookieName);
  return NextResponse.json({ profileId: null });
}
