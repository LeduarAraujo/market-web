import { NextResponse } from "next/server";
import {
  getIntegrationStatus,
  getProfileSessionId,
  getRagfairPaymentItems,
  isSptConnectionError,
  requestSpt,
} from "@/lib/spt-data";
import { getSelectedProfileId } from "@/lib/profile-session";

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

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 262144) {
    return NextResponse.json({ error: "Corpo da requisição excede o limite permitido." }, { status: 413 });
  }

  const profileId = await getSelectedProfileId();
  if (!profileId) {
    return NextResponse.json({ error: "Selecione um perfil antes de usar o mercado." }, { status: 401 });
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
    !isRecord(body.payload)
  ) {
    return NextResponse.json(
      { error: "Informe o payload da operação SPT." },
      { status: 400 },
    );
  }

  let payload = body.payload;
  if (operation === "buy") {
    const offerId = payload.offerId;
    const currencyTemplateId = payload.currencyTemplateId;
    const price = payload.price;
    if (
      typeof offerId !== "string" ||
      !/^[a-f\d]{24}$/i.test(offerId) ||
      typeof currencyTemplateId !== "string" ||
      !/^[a-f\d]{24}$/i.test(currencyTemplateId) ||
      typeof price !== "number" ||
      !Number.isSafeInteger(price) ||
      price <= 0
    ) {
      return NextResponse.json(
        { error: "Informe o ID, a moeda e o preço válidos da oferta." },
        { status: 400 },
      );
    }

    try {
      const paymentItems = await getRagfairPaymentItems(profileId, currencyTemplateId, price);
      payload = {
        Action: "RagFairBuyOffer",
        offers: [{ id: offerId, count: 1, items: paymentItems }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível preparar o pagamento.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  if (Object.keys(payload).length === 0 && !emptyPayloadOperations.has(operation)) {
    return NextResponse.json({ error: "O payload da operação não pode estar vazio." }, { status: 400 });
  }

  try {
    const sessionId = await getProfileSessionId(profileId);
    const serverResponse = await requestSpt(route, {
      timeoutMs: 12000,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Cookie: `PHPSESSID=${sessionId}`,
      },
      body: JSON.stringify(payload),
    });
    if (!serverResponse.body) {
      return NextResponse.json(
        serverResponse.statusCode >= 400
          ? {
              error: "spt_request_failed",
              statusCode: serverResponse.statusCode,
              message: `O servidor SPT respondeu HTTP ${serverResponse.statusCode} sem um corpo JSON. Consulte o log do servidor para ver o motivo.`,
            }
          : {
              error: "spt_empty_response",
              statusCode: serverResponse.statusCode,
              message: "O SPT retornou uma resposta vazia. Confirme nos logs se o perfil foi carregado sem erros e se o personagem está disponível no jogo.",
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
