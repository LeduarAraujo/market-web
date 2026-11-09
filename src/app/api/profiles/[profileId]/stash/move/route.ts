import { NextResponse } from "next/server";
import { getSelectedProfileId } from "@/lib/profile-session";
import {
  getIntegrationStatus,
  getProfileSessionId,
  getStashMoveRequest,
  isSptConnectionError,
  requestSpt,
} from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemIdPattern = /^[a-f\d]{24}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ profileId: string }> },
) {
  const { profileId } = await context.params;
  const selectedProfileId = await getSelectedProfileId();
  if (!selectedProfileId || selectedProfileId !== profileId) {
    return NextResponse.json({ error: "Selecione este perfil antes de mover itens." }, { status: 401 });
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const requestUrl = new URL(request.url);
      const host = request.headers.get("host");
      const expectedOrigin = host
        ? new URL(`${requestUrl.protocol}//${host}`).origin
        : requestUrl.origin;
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

  if (
    !isRecord(body) ||
    typeof body.itemId !== "string" ||
    !itemIdPattern.test(body.itemId) ||
    !Number.isSafeInteger(body.x) ||
    !Number.isSafeInteger(body.y) ||
    Number(body.x) < 0 ||
    Number(body.y) < 0
  ) {
    return NextResponse.json({ error: "Informe o item e a posição de destino válidos." }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof getStashMoveRequest>>;
  let sessionId: string;
  try {
    payload = await getStashMoveRequest(profileId, body.itemId, Number(body.x), Number(body.y));
    sessionId = await getProfileSessionId(profileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível preparar a movimentação do item.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const integration = await getIntegrationStatus();
    if (!integration.connectorInstalled || !integration.stashMove) {
      return NextResponse.json({ error: integration.message }, { status: 503 });
    }

    const result = await requestSpt("/spt-market/stash/move", {
      timeoutMs: 12000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: `PHPSESSID=${sessionId}`,
      },
      body: JSON.stringify(payload),
    });

    if (!result.body) {
      return NextResponse.json(
        { error: `O servidor SPT respondeu HTTP ${result.statusCode} sem confirmar a movimentação.` },
        { status: 502 },
      );
    }

    if (result.contentType?.includes("json")) {
      try {
        const responseBody: unknown = JSON.parse(result.body);
        const responseRecord = isRecord(responseBody) ? responseBody : null;
        const warnings = Object.entries(responseRecord ?? {}).find(
          ([key]) => key.toLowerCase() === "warnings",
        )?.[1];
        const hasWarnings =
          (Array.isArray(warnings) && warnings.length > 0) ||
          (isRecord(warnings) && Object.keys(warnings).length > 0);
        if (hasWarnings) {
          return NextResponse.json(
            { error: "O servidor SPT não aceitou essa posição para o item.", details: warnings },
            { status: 409 },
          );
        }
      } catch {
        return NextResponse.json(
          { error: "O servidor SPT retornou uma resposta inválida ao mover o item." },
          { status: 502 },
        );
      }
    }

    return new NextResponse(result.body, {
      status: result.statusCode,
      headers: {
        "Content-Type": result.contentType?.includes("json")
          ? "application/json"
          : "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isSptConnectionError(error)) {
      return NextResponse.json({ error: "Não foi possível alcançar o servidor SPT local." }, { status: 503 });
    }

    throw error;
  }
}
