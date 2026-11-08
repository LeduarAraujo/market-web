import { NextResponse } from "next/server";
import {
  getIntegrationStatus,
  getProfileSessionId,
  isSptConnectionError,
  requestSpt,
} from "@/lib/spt-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const operationPaths: Record<string, string> = {
  search: "/spt-market/ragfair/search",
  price: "/spt-market/ragfair/price",
  "flea-prices": "/spt-market/ragfair/prices",
  "find-offer": "/spt-market/ragfair/find-by-id",
  list: "/spt-market/ragfair/offer/create",
  cancel: "/spt-market/ragfair/offer/remove",
  extend: "/spt-market/ragfair/offer/extend",
  buy: "/spt-market/ragfair/buy",
  "trader-buy": "/spt-market/traders/trade",
  "trader-sell": "/spt-market/traders/trade",
};
const unavailableOperations: Record<string, string> = {
  "my-offers": "A consulta de ofertas próprias ainda não está implementada.",
  "trader-catalog": "A leitura do catálogo de comerciantes ainda não está implementada.",
};
const emptyPayloadOperations = new Set(["flea-prices"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ operation: string }> },
) {
  const { operation } = await context.params;
  if (Object.hasOwn(unavailableOperations, operation)) {
    return NextResponse.json(
      { error: "operation_not_available", message: unavailableOperations[operation] },
      { status: 501 },
    );
  }

  const route = Object.hasOwn(operationPaths, operation) ? operationPaths[operation] : undefined;

  if (!route) {
    return NextResponse.json({ error: "Operação desconhecida." }, { status: 404 });
  }

  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 262144) {
    return NextResponse.json({ error: "Corpo da requisição excede o limite permitido." }, { status: 413 });
  }

  const integration = await getIntegrationStatus();
  if (!integration.connectorInstalled) {
    return NextResponse.json(
      { error: "connector_not_installed", message: integration.message },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
  }

  if (
    !isRecord(body) ||
    typeof body.profileId !== "string" ||
    !/^[a-f\d]{24}$/i.test(body.profileId) ||
    !isRecord(body.payload)
  ) {
    return NextResponse.json(
      { error: "Informe profileId e o payload nativo da operação SPT." },
      { status: 400 },
    );
  }

  if (Object.keys(body.payload).length === 0 && !emptyPayloadOperations.has(operation)) {
    return NextResponse.json({ error: "O payload da operação não pode estar vazio." }, { status: 400 });
  }

  try {
    const sessionId = await getProfileSessionId(body.profileId);
    const serverResponse = await requestSpt(route, {
      timeoutMs: 12000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: `PHPSESSID=${sessionId}`,
      },
      body: JSON.stringify(body.payload),
    });
    if (!serverResponse.body) {
      return NextResponse.json(
        {
          error: "spt_empty_response",
          message: "O SPT não retornou o JSON esperado. Confirme se o personagem está carregado e se o payload é válido para essa operação.",
        },
        { status: 502 },
      );
    }

    const contentType = serverResponse.contentType?.includes("json")
      ? "application/json"
      : "text/plain; charset=utf-8";

    return new NextResponse(serverResponse.body, {
      status: serverResponse.statusCode,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (isSptConnectionError(error)) {
      return NextResponse.json(
        { error: "spt_server_unreachable", message: "Não foi possível alcançar o servidor SPT local." },
        { status: 503 },
      );
    }

    if (error instanceof Error && error.message === "O perfil não tem uma sessão SPT válida.") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    throw error;
  }
}
