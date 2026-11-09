import { readFile, readdir } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";

export type PlayerProfile = {
  id: string;
  name: string;
  level: number;
  edition: string;
  faction: string;
};

type RawHandbook = {
  Categories?: Array<{
    Id?: string;
    ParentId?: string | null;
    Order?: string;
  }>;
  Items?: Array<{
    Id?: string;
    ParentId?: string;
  }>;
};

export type CurrencyBalances = {
  rubles: number;
  dollars: number;
  euros: number;
  gpCoins: number;
};

export type StashItem = {
  id: string;
  templateId: string;
  name: string;
  shortName: string;
  parentId: string | null;
  x: number | null;
  y: number | null;
  rotated: boolean;
  width: number;
  height: number;
  stackCount: number;
  category: string;
};

export type TraderSummary = {
  id: string;
  name: string;
  nickname: string;
  loyaltyLevel: number;
  standing: number;
  unlocked: boolean;
};

export type FleaCategory = {
  id: string;
  name: string;
  parentId: string | null;
  itemCount: number;
  order: number;
};

export type FleaCatalogItem = {
  id: string;
  name: string;
  shortName: string;
  categoryId: string;
  conditionMax: number | null;
};

export type FleaCatalog = {
  categories: FleaCategory[];
  items: FleaCatalogItem[];
};

export type RagfairPaymentItem = {
  id: string;
  count: number;
};

export type LockedTraderOffer = {
  _id: string;
  root: string;
  items: Array<{
    _id: string;
    _tpl: string;
    upd: {
      StackObjectsCount: number;
      MedKit?: { HpResource: number };
    };
  }>;
  user: { id: string; nickname: string; memberType: number };
  requirements: Array<{ _tpl: string; count: number }>;
  loyaltyLevel: number;
  buyRestrictionMax: number | null;
  locked: true;
  lockedReason: string;
};

type RawProfile = {
  info?: {
    username?: string;
    edition?: string;
  };
  characters?: {
    pmc?: {
      _id?: string;
      sessionId?: string;
      Info?: {
        Nickname?: string;
        Level?: number;
        Side?: string;
      };
      Inventory?: {
        items?: Array<Record<string, unknown>>;
        stash?: string;
      };
      TradersInfo?: Record<
        string,
        { loyaltyLevel?: number; standing?: number; unlocked?: boolean; disabled?: boolean }
      >;
      Quests?: Array<{ qid?: string; status?: number }>;
    };
  };
};

type RawTemplate = {
  _id?: string;
  _name?: string;
  _parent?: string;
  _props?: {
    Width?: number;
    Height?: number;
    StackMaxSize?: number;
    CanSellOnRagfair?: boolean;
    MaxHpResource?: number;
  };
};

type RawTrader = {
  nickname?: string;
  unlockedByDefault?: boolean;
  loyaltyLevels?: unknown[];
};

type RawTraderAssortItem = {
  _id?: string;
  _tpl?: string;
  parentId?: string;
  slotId?: string;
  upd?: {
    BuyRestrictionMax?: number;
    StackObjectsCount?: number;
  };
};

type RawTraderAssort = {
  items?: RawTraderAssortItem[];
  barter_scheme?: Record<string, Array<Array<{ _tpl?: string; count?: number }>>>;
  loyal_level_items?: Record<string, number>;
};

type RawTraderQuestAssort = {
  started?: Record<string, string>;
  success?: Record<string, string>;
};

type RawTraderSettings = RawTrader & {
  _id?: string;
};

type HttpConfig = {
  ip?: string;
  port?: number;
};

type SptRequestOptions = {
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
};

type SptResponse = {
  statusCode: number;
  contentType?: string;
  body: string;
};

const profileIdPattern = /^[a-f\d]{24}$/i;
const englishTraderNames: Record<string, string> = {
  "656f0f98d80a697f855d34b1": "BTR",
};
const itemTemplatesCache = new Map<string, RawTemplate>();
let localeCache: Record<string, string> | undefined;
let fleaCatalogCache: Promise<FleaCatalog> | undefined;

function getEnglishTraderName(id: string, nickname: string | undefined, fallback = "") {
  const knownName = englishTraderNames[id.toLowerCase()];
  if (knownName) return knownName;

  const name = nickname?.trim() || fallback.trim();
  if (!name) return "";
  return `${name[0].toLocaleUpperCase("en")}${name.slice(1)}`;
}

function getSptPaths() {
  const root = path.resolve(process.env.SPT_ROOT ?? path.resolve(process.cwd(), ".."));
  const runtime = path.join(root, "SPT_Runtime");

  return {
    profiles: path.join(runtime, "user", "profiles"),
    templates: path.join(runtime, "SPT_Data", "database", "templates", "items.json"),
    handbook: path.join(runtime, "SPT_Data", "database", "templates", "handbook.json"),
    locale: path.join(runtime, "SPT_Data", "database", "locales", "global", "en.json"),
    traders: path.join(runtime, "SPT_Data", "database", "traders"),
    httpConfig: path.join(runtime, "SPT_Data", "configs", "http.json"),
    serverCertificate: path.join(runtime, "user", "certs", "server.crt"),
  };
}

async function readJson<T>(filePath: string): Promise<T> {
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as T;
}

async function readOptionalJson<T>(filePath: string, fallback: T): Promise<T> {
  try {
    return await readJson<T>(filePath);
  } catch (error) {
    if (error instanceof Error && "code" in error && String(error.code) === "ENOENT") {
      return fallback;
    }
    throw error;
  }
}

async function readProfileFile(profileId: string): Promise<RawProfile> {
  if (!profileIdPattern.test(profileId)) {
    throw new Error("Perfil inválido.");
  }

  const file = path.join(getSptPaths().profiles, `${profileId}.json`);
  return readJson<RawProfile>(file);
}

export async function listProfiles(): Promise<PlayerProfile[]> {
  const { profiles } = getSptPaths();
  const entries = await readdir(/*turbopackIgnore: true*/ profiles, { withFileTypes: true });
  const profileFiles = entries.filter(
    (entry) => entry.isFile() && profileIdPattern.test(path.parse(entry.name).name) && path.extname(entry.name) === ".json",
  );
  const results = await Promise.all(
    profileFiles.map(async (entry) => {
      const id = path.parse(entry.name).name;
      const profile = await readProfileFile(id);
      const pmc = profile.characters?.pmc;

      if (!pmc?.Inventory?.stash || !Array.isArray(pmc.Inventory.items)) {
        return null;
      }

      return {
        id,
        name: pmc.Info?.Nickname ?? profile.info?.username ?? "PMC",
        level: Number(pmc.Info?.Level ?? 0),
        edition: profile.info?.edition ?? "SPT",
        faction: pmc.Info?.Side ?? "USEC",
      } satisfies PlayerProfile;
    }),
  );

  return results.filter((profile): profile is PlayerProfile => profile !== null);
}

export async function getProfileCurrencies(profileId: string): Promise<CurrencyBalances> {
  const profile = await readProfileFile(profileId);
  const items = profile.characters?.pmc?.Inventory?.items ?? [];
  const templateIds: Record<string, keyof CurrencyBalances> = {
    "5449016a4bdc2d6f028b456f": "rubles",
    "5696686a4bdc2da3298b456a": "dollars",
    "569668774bdc2da2298b4568": "euros",
    "5d235b4d86f7742e017bc88a": "gpCoins",
  };
  const balances: CurrencyBalances = { rubles: 0, dollars: 0, euros: 0, gpCoins: 0 };

  for (const item of items) {
    const currency = templateIds[String(item._tpl)];
    if (!currency) continue;

    const upd =
      typeof item.upd === "object" && item.upd !== null
        ? (item.upd as Record<string, unknown>)
        : undefined;
    const count = upd?.StackObjectsCount;
    balances[currency] +=
      typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? count : 1;
  }

  return balances;
}

export async function getFleaCatalog(): Promise<FleaCatalog> {
  fleaCatalogCache ??= (async () => {
    const [handbook, templates, locale] = await Promise.all([
      readJson<RawHandbook>(getSptPaths().handbook),
      getTemplates(),
      getLocale(),
    ]);
    const categoryRows = (handbook.Categories ?? []).filter(
      (category): category is Required<Pick<typeof category, "Id">> & typeof category =>
        typeof category.Id === "string",
    );
    const categoriesById = new Map(categoryRows.map((category) => [category.Id, category]));
    const items = (handbook.Items ?? [])
      .filter(
        (item): item is Required<Pick<typeof item, "Id" | "ParentId">> & typeof item =>
          typeof item.Id === "string" && typeof item.ParentId === "string",
      )
      .map((item) => {
        const template = templates.get(item.Id);
        const name = locale[`${item.Id} Name`] ?? template?._name ?? item.Id;
        return {
          id: item.Id,
          name: name.replaceAll("_", " "),
          shortName: (locale[`${item.Id} ShortName`] ?? name).replaceAll("_", " "),
          categoryId: item.ParentId,
          conditionMax:
            typeof template?._props?.MaxHpResource === "number"
              ? template._props.MaxHpResource
              : null,
        } satisfies FleaCatalogItem;
      })
      .sort((left, right) => left.name.localeCompare(right.name));

    const itemCounts = new Map<string, number>();
    for (const item of items) {
      let categoryId: string | null = item.categoryId;
      const visited = new Set<string>();
      while (categoryId && categoriesById.has(categoryId) && !visited.has(categoryId)) {
        visited.add(categoryId);
        itemCounts.set(categoryId, (itemCounts.get(categoryId) ?? 0) + 1);
        const parentId: string | null | undefined = categoriesById.get(categoryId)?.ParentId;
        categoryId = typeof parentId === "string" ? parentId : null;
      }
    }

    const categories = categoryRows
      .map((category) => ({
        id: category.Id,
        name: locale[category.Id]?.trim() || "Outros itens",
        parentId: typeof category.ParentId === "string" ? category.ParentId : null,
        itemCount: itemCounts.get(category.Id) ?? 0,
        order: Number(category.Order ?? 0),
      }))
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));

    return { categories, items };
  })();

  try {
    return await fleaCatalogCache;
  } catch (error) {
    fleaCatalogCache = undefined;
    throw error;
  }
}

export async function getRagfairPaymentItems(
  profileId: string,
  currencyTemplateId: string,
  price: number,
): Promise<RagfairPaymentItem[]> {
  const currencyTemplateIds = new Set([
    "5449016a4bdc2d6f028b456f",
    "5696686a4bdc2da3298b456a",
    "569668774bdc2da2298b4568",
  ]);
  if (!currencyTemplateIds.has(currencyTemplateId) || !Number.isSafeInteger(price) || price <= 0) {
    throw new Error("O pagamento da oferta não é uma moeda válida do flea market.");
  }

  const profile = await readProfileFile(profileId);
  const inventoryItems = profile.characters?.pmc?.Inventory?.items ?? [];
  let remaining = price;
  const paymentItems: RagfairPaymentItem[] = [];

  for (const item of inventoryItems) {
    if (item._tpl !== currencyTemplateId || remaining <= 0) continue;

    const itemId = item._id;
    if (typeof itemId !== "string" || !profileIdPattern.test(itemId)) continue;

    const upd =
      typeof item.upd === "object" && item.upd !== null
        ? (item.upd as Record<string, unknown>)
        : undefined;
    const stackCount = upd?.StackObjectsCount;
    const available =
      typeof stackCount === "number" && Number.isSafeInteger(stackCount) && stackCount > 0
        ? stackCount
        : 1;
    const count = Math.min(available, remaining);
    paymentItems.push({ id: itemId, count });
    remaining -= count;
  }

  if (remaining > 0) {
    throw new Error("Saldo insuficiente no perfil local para pagar esta oferta.");
  }

  return paymentItems;
}

async function getTemplates(): Promise<Map<string, RawTemplate>> {
  if (itemTemplatesCache.size > 0) {
    return itemTemplatesCache;
  }

  const templates = await readJson<Record<string, RawTemplate>>(getSptPaths().templates);
  for (const [id, template] of Object.entries(templates)) {
    itemTemplatesCache.set(id, template);
  }

  return itemTemplatesCache;
}

async function getLocale(): Promise<Record<string, string>> {
  localeCache ??= await readJson<Record<string, string>>(getSptPaths().locale);
  return localeCache;
}

export async function getStash(profileId: string): Promise<StashItem[]> {
  const profile = await readProfileFile(profileId);
  const inventory = profile.characters?.pmc?.Inventory;

  if (!inventory?.stash || !inventory.items) {
    throw new Error("O perfil não contém um stash PMC válido.");
  }

  const [templates, locale] = await Promise.all([getTemplates(), getLocale()]);
  return inventory.items
    .filter((item) => item.parentId === inventory.stash)
    .map((item) => {
      const id = String(item._id ?? "");
      const templateId = String(item._tpl ?? "");
      const template = templates.get(templateId);
      const location =
        typeof item.location === "object" && item.location !== null
          ? (item.location as Record<string, unknown>)
          : undefined;
      const rotated = location?.r === "Vertical";
      const rawName = locale[`${templateId} Name`] ?? template?._name ?? "Unknown item";

      return {
        id,
        templateId,
        name: rawName.replaceAll("_", " "),
        shortName: locale[`${templateId} ShortName`] ?? rawName.replaceAll("_", " "),
        parentId: typeof item.parentId === "string" ? item.parentId : null,
        x: typeof location?.x === "number" ? location.x : null,
        y: typeof location?.y === "number" ? location.y : null,
        rotated,
        width: Math.max(1, Number(rotated ? template?._props?.Height ?? 1 : template?._props?.Width ?? 1)),
        height: Math.max(1, Number(rotated ? template?._props?.Width ?? 1 : template?._props?.Height ?? 1)),
        stackCount:
          typeof item.upd === "object" &&
          item.upd !== null &&
          typeof (item.upd as Record<string, unknown>).StackObjectsCount === "number"
            ? Number((item.upd as Record<string, unknown>).StackObjectsCount)
            : 1,
        category: template?._parent ?? "unknown",
      } satisfies StashItem;
    });
}

export async function getProfileSessionId(profileId: string): Promise<string> {
  const profile = await readProfileFile(profileId);
  const sessionId = profile.characters?.pmc?.sessionId;

  if (!sessionId || !profileIdPattern.test(sessionId) || sessionId.toLowerCase() !== profileId.toLowerCase()) {
    throw new Error("O perfil não tem uma sessão SPT válida.");
  }

  return sessionId;
}

export async function getSptServerUrl(): Promise<string> {
  const config = await readJson<HttpConfig>(getSptPaths().httpConfig);
  const configuredHost = config.ip?.trim() ?? "127.0.0.1";
  const port = Number(config.port);

  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !["127.0.0.1", "localhost", "::1", "0.0.0.0"].includes(configuredHost)
  ) {
    throw new Error("O SPT precisa estar configurado para acesso local.");
  }

  const host = configuredHost === "0.0.0.0" ? "127.0.0.1" : configuredHost;
  const formattedHost = host.includes(":") ? `[${host}]` : host;
  return `https://${formattedHost}:${port}`;
}

export async function requestSpt(
  route: string,
  options: SptRequestOptions = {},
): Promise<SptResponse> {
  const [baseUrl, certificate] = await Promise.all([
    getSptServerUrl(),
    readFile(getSptPaths().serverCertificate, "utf8"),
  ]);
  const requestUrl = new URL(route, baseUrl);

  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      requestUrl,
      {
        method: "POST",
        headers: {
          requestcompressed: "0",
          responsecompressed: "0",
          ...options.headers,
        },
        ca: certificate,
      },
      (response) => {
        const chunks: Buffer[] = [];

        response.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        response.on("error", reject);
        response.on("end", () => {
          if (typeof response.statusCode !== "number") {
            reject(new Error("O servidor SPT não retornou um código HTTP."));
            return;
          }

          resolve({
            statusCode: response.statusCode,
            contentType: response.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );

    request.setTimeout(options.timeoutMs ?? 12000, () => {
      const error = new Error("Tempo limite ao conectar ao servidor SPT.");
      Object.assign(error, { code: "ETIMEDOUT" });
      request.destroy(error);
    });
    request.on("error", reject);

    if (options.body) {
      request.write(options.body);
    }

    request.end();
  });
}

export function isSptConnectionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EHOSTUNREACH", "ENETUNREACH"].includes(
      String(error.code),
    )
  );
}

export async function getTraders(profileId: string): Promise<TraderSummary[]> {
  const profile = await readProfileFile(profileId);
  const traderState = profile.characters?.pmc?.TradersInfo ?? {};
  const { traders: tradersPath } = getSptPaths();
  const entries = await readdir(/*turbopackIgnore: true*/ tradersPath, { withFileTypes: true });
  const traderFiles = entries.filter((entry) => entry.isDirectory());
  const results = await Promise.all(
    traderFiles.map(async (entry) => {
      const id = entry.name;
      const trader = await readJson<RawTrader>(path.join(tradersPath, id, "base.json"));
      const state = traderState[id];
      const nickname = getEnglishTraderName(id, trader.nickname);

      return {
        id,
        nickname,
        name: nickname,
        loyaltyLevel: Number(state?.loyaltyLevel ?? 0),
        standing: Number(state?.standing ?? 0),
        unlocked: Boolean(state?.unlocked ?? trader.unlockedByDefault),
      } satisfies TraderSummary;
    }),
  );

  const tradersById = new Map(
    results
      .filter((trader): trader is TraderSummary => trader !== null && trader.name.length > 0)
      .map((trader) => [trader.id, trader]),
  );

  try {
    const sessionId = await getProfileSessionId(profileId);
    const response = await requestSpt("/client/trading/api/traderSettings", {
      timeoutMs: 1500,
      headers: {
        "Content-Type": "application/json",
        Cookie: `PHPSESSID=${sessionId}`,
      },
      body: "{}",
    });

    if (response.statusCode !== 200) {
      throw new Error(`O SPT não conseguiu carregar os dados dos comerciantes (HTTP ${response.statusCode}).`);
    }

    let responseData: unknown;
    try {
      responseData = JSON.parse(response.body);
    } catch {
      throw new Error("O SPT retornou dados inválidos para os comerciantes.");
    }

    if (
      typeof responseData !== "object" ||
      responseData === null ||
      !("data" in responseData) ||
      !Array.isArray(responseData.data)
    ) {
      throw new Error("O SPT retornou uma lista de comerciantes em formato inesperado.");
    }

    for (const value of responseData.data) {
      if (typeof value !== "object" || value === null || Array.isArray(value)) continue;
      const trader = value as RawTraderSettings;
      if (typeof trader._id !== "string" || !profileIdPattern.test(trader._id)) continue;

      const existing = tradersById.get(trader._id);
      const nickname = getEnglishTraderName(trader._id, trader.nickname, existing?.nickname ?? "");
      const name = nickname || existing?.name || "";
      if (!name) continue;

      tradersById.set(trader._id, {
        id: trader._id,
        nickname,
        name,
        loyaltyLevel: existing?.loyaltyLevel ?? 0,
        standing: existing?.standing ?? 0,
        unlocked: existing?.unlocked ?? Boolean(trader.unlockedByDefault),
      });
    }
  } catch (error) {
    if (!isSptConnectionError(error)) throw error;
  }

  return [...tradersById.values()].sort((left, right) => left.name.localeCompare(right.name));
}

export async function getLockedTraderOffers(
  profileId: string,
  templateId: string,
): Promise<LockedTraderOffer[]> {
  if (!profileIdPattern.test(profileId)) {
    throw new Error("Perfil inválido.");
  }
  if (!profileIdPattern.test(templateId)) {
    throw new Error("O item informado é inválido.");
  }

  const [profile, templates, locale] = await Promise.all([
    readProfileFile(profileId),
    getTemplates(),
    getLocale(),
  ]);
  const template = templates.get(templateId);
  if (template?._props?.CanSellOnRagfair !== true) return [];

  const pmc = profile.characters?.pmc;
  const traderState = pmc?.TradersInfo ?? {};
  const questStatuses = new Map(
    (pmc?.Quests ?? [])
      .filter((quest): quest is { qid: string; status: number } =>
        typeof quest.qid === "string" && typeof quest.status === "number",
      )
      .map((quest) => [quest.qid, quest.status]),
  );
  const { traders: tradersPath } = getSptPaths();
  const entries = await readdir(/*turbopackIgnore: true*/ tradersPath, { withFileTypes: true });
  const traderDirectories = entries.filter((entry) => entry.isDirectory());
  const offersByTrader = await Promise.all(
    traderDirectories.map(async (entry) => {
      const traderId = entry.name;
      const traderDirectory = path.join(tradersPath, traderId);
      const [trader, assort, questAssort] = await Promise.all([
        readJson<RawTrader>(path.join(traderDirectory, "base.json")),
        readJson<RawTraderAssort>(path.join(traderDirectory, "assort.json")),
        readOptionalJson<RawTraderQuestAssort>(
          path.join(traderDirectory, "questassort.json"),
          {},
        ),
      ]);
      const state = traderState[traderId];
      const traderName = getEnglishTraderName(traderId, trader.nickname);
      const currentLevel = Number(state?.loyaltyLevel ?? 0);

      return (assort.items ?? [])
        .filter(
          (item): item is RawTraderAssortItem & { _id: string } =>
            item._tpl === templateId &&
            typeof item._id === "string" &&
            (item.parentId === "hideout" || item.slotId === "hideout"),
        )
        .flatMap((item) => {
          const requirements: string[] = [];
          const requiredLevel = Number(assort.loyal_level_items?.[item._id] ?? 1);
          const unlocked = state?.unlocked ?? trader.unlockedByDefault ?? false;
          if (state?.disabled || !unlocked) {
            requirements.push("Comerciante ainda não desbloqueado");
          }
          if (requiredLevel > currentLevel) {
            requirements.push(`Requer nível de lealdade ${requiredLevel} (atual: ${currentLevel})`);
          }

          const requiredQuestId =
            questAssort.success?.[item._id] ?? questAssort.started?.[item._id];
          if (requiredQuestId) {
            const questStatus = questStatuses.get(requiredQuestId);
            const requiresQuestCompletion = questAssort.success?.[item._id] === requiredQuestId;
            const questIsAvailable =
              !requiresQuestCompletion &&
              typeof questStatus === "number" &&
              questStatus >= 2 &&
              questStatus <= 4;
            const questIsCompleted = questStatus === 4;
            if (
              (requiresQuestCompletion && !questIsCompleted) ||
              (questAssort.started?.[item._id] === requiredQuestId && !questIsAvailable)
            ) {
              const questName = locale[`${requiredQuestId} name`] ?? "missão requerida";
              requirements.push(
                `${requiresQuestCompletion ? "Requer concluir" : "Requer iniciar"} a missão: ${questName}`,
              );
            }
          }

          if (requirements.length === 0) return [];

          const payment = assort.barter_scheme?.[item._id]?.[0] ?? [];
          const stackCount = item.upd?.BuyRestrictionMax ?? 1;
          const offer: LockedTraderOffer = {
            _id: `locked-${traderId}-${item._id}`,
            root: item._id,
            items: [
              {
                _id: item._id,
                _tpl: templateId,
                upd: {
                  StackObjectsCount: Math.max(1, stackCount),
                  ...(template?._props?.MaxHpResource
                    ? { MedKit: { HpResource: template._props.MaxHpResource } }
                    : {}),
                },
              },
            ],
            user: { id: traderId, nickname: traderName, memberType: 4 },
            requirements: payment.flatMap((requirement) =>
              typeof requirement._tpl === "string" && typeof requirement.count === "number"
                ? [{ _tpl: requirement._tpl, count: requirement.count }]
                : [],
            ),
            loyaltyLevel: requiredLevel,
            buyRestrictionMax: item.upd?.BuyRestrictionMax ?? null,
            locked: true,
            lockedReason: requirements.join(" · "),
          };
          return [offer];
        });
    }),
  );

  return offersByTrader.flat();
}

export async function getIntegrationStatus() {
  try {
    const response = await requestSpt("/spt-market/status", {
      timeoutMs: 1200,
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    if (response.statusCode !== 200) {
      return {
        profileRead: true,
        stashRead: true,
        fleaSearch: false,
        fleaBuy: false,
        offerManagement: false,
        traderTransactions: false,
        connectorInstalled: false,
        serverReachable: true,
        message: "Servidor SPT online; conector do mercado não encontrado.",
      };
    }

    let result: unknown;
    try {
      result = JSON.parse(response.body);
    } catch {
      result = null;
    }
    const connectorInstalled =
      typeof result === "object" &&
      result !== null &&
      "connector" in result &&
      result.connector === "spt-market" &&
      "protocol" in result &&
      result.protocol === 1;

    return {
      profileRead: true,
      stashRead: true,
      fleaSearch: connectorInstalled,
      fleaBuy: connectorInstalled,
      offerManagement: connectorInstalled,
      traderTransactions: connectorInstalled,
      connectorInstalled,
      serverReachable: true,
      message: connectorInstalled
        ? "Conector SPT encontrado; operações ainda dependem de requisições validadas."
        : "Resposta do servidor SPT não reconhecida como conector do mercado.",
    };
  } catch (error) {
    if (isSptConnectionError(error)) {
      return {
        profileRead: true,
        stashRead: true,
        fleaSearch: false,
        fleaBuy: false,
        offerManagement: false,
        traderTransactions: false,
        connectorInstalled: false,
        serverReachable: false,
        message: "Servidor SPT local está offline.",
      };
    }

    throw error;
  }
}
