"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CurrencyBalances,
  FleaCatalog,
  FleaCatalogItem,
  PlayerProfile,
  StashItem,
  TraderSummary,
} from "@/lib/spt-data";

type Screen = "characters" | "stash" | "flea" | "traders";
type Integration = {
  profileRead: boolean;
  stashRead: boolean;
  fleaSearch: boolean;
  fleaBuy: boolean;
  offerManagement: boolean;
  traderTransactions: boolean;
  connectorInstalled: boolean;
  message: string;
};

type FleaOfferView = {
  id: string;
  itemId: string;
  itemName: string;
  itemCount: number;
  seller: string;
  sellerIsTrader: boolean;
  rating: number | null;
  conditionPercent: number | null;
  conditionValue: number | null;
  conditionMaximum: number | null;
  foundInRaid: boolean;
  price: number | null;
  currencyTemplateId: string | null;
  currencyLabel: string;
  barterItems: string[];
  endTime: number | null;
  traderLimit: number | null;
  loyaltyLevel: number | null;
  locked: boolean;
  lockedReason: string | null;
};

type FleaSearchOptions = {
  ownerType?: number;
  excludeBartering?: boolean;
  sort?: string;
  conditionFrom?: number;
  conditionTo?: number;
};

const currenciesByTemplate: Record<string, { label: string; symbol: string }> = {
  "5449016a4bdc2d6f028b456f": { label: "RUB", symbol: "₽" },
  "5696686a4bdc2da3298b456a": { label: "USD", symbol: "$" },
  "569668774bdc2da2298b4568": { label: "EUR", symbol: "€" },
};

const screens: Array<{ id: Screen; label: string; short: string }> = [
  { id: "stash", label: "STASH", short: "ST" },
  { id: "flea", label: "FLEA MARKET", short: "FM" },
  { id: "traders", label: "TRADERS", short: "TR" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstString(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    if (typeof record[key] === "string" && record[key]) return record[key] as string;
  }
  return "";
}

function firstNumber(record: Record<string, unknown>, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function getOffersResponse(value: unknown): { offers: Record<string, unknown>[]; count: number | null } {
  const outer = asRecord(value);
  const result = asRecord(outer?.data) ?? asRecord(outer?.result) ?? outer;
  const rawOffers = result?.offers ?? result?.Offers;
  const offers = Array.isArray(rawOffers)
    ? rawOffers.map(asRecord).filter((offer): offer is Record<string, unknown> => offer !== null)
    : [];
  return {
    offers,
    count: result ? firstNumber(result, "offersCount", "OffersCount", "count") : null,
  };
}

function getOfferRequirements(offer: Record<string, unknown>) {
  const requirements = offer.requirements ?? offer.Requirements;
  return Array.isArray(requirements)
    ? requirements.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
}

function normalizeFleaOffer(
  offer: Record<string, unknown>,
  catalogItems: Map<string, FleaCatalogItem>,
  traders: TraderSummary[],
): FleaOfferView {
  const listedItems = offer.items ?? offer.Items;
  const itemList = Array.isArray(listedItems)
    ? listedItems.map(asRecord).filter((item): item is Record<string, unknown> => item !== null)
    : [];
  const rootId = firstString(offer, "root", "Root", "rootId", "RootId");
  const rootItem =
    itemList.find((item) => item._id === rootId || item.Id === rootId) ?? itemList[0];
  const itemId =
    (rootItem ? firstString(rootItem, "_tpl", "templateId", "TemplateId") : "") ||
    firstString(offer, "templateId", "TemplateId");
  const item = catalogItems.get(itemId);
  const rootUpd = rootItem ? asRecord(rootItem.upd) ?? asRecord(rootItem.Upd) : null;
  const repairable = rootUpd ? asRecord(rootUpd.Repairable) ?? asRecord(rootUpd.repairable) : null;
  const medKit = rootUpd ? asRecord(rootUpd.MedKit) ?? asRecord(rootUpd.medKit) : null;
  const durability = repairable ? firstNumber(repairable, "Durability") : null;
  const maxDurability = repairable ? firstNumber(repairable, "MaxDurability") : null;
  const hpResource = medKit ? firstNumber(medKit, "HpResource") : null;
  const conditionValue = durability ?? hpResource;
  const conditionMaximum = maxDurability ?? (hpResource !== null ? item?.conditionMax ?? null : null);
  const user = asRecord(offer.user) ?? asRecord(offer.User) ?? {};
  const traderIds = [
    firstString(offer, "traderId", "TraderId", "ownerId", "OwnerId", "userId", "UserId"),
    firstString(user, "traderId", "TraderId", "ownerId", "OwnerId", "id", "_id", "Id"),
  ].filter(Boolean);
  const avatar = firstString(user, "avatar", "Avatar", "avatarUrl", "AvatarUrl");
  const avatarTraderId = avatar.match(/[a-f\d]{24}/i)?.[0];
  if (avatarTraderId) traderIds.push(avatarTraderId);
  const trader = traders.find((entry) => traderIds.includes(entry.id));
  const memberType = firstNumber(user, "memberType", "MemberType");
  const sellerType = firstString(offer, "ownerType", "OwnerType").toLocaleLowerCase("en");
  const sellerIsTrader = Boolean(
    trader ||
      memberType === 4 ||
      sellerType === "trader" ||
      sellerType === "traderownertype",
  );
  const requirements = getOfferRequirements(offer);
  const monetaryRequirement = requirements.find((requirement) => {
    const templateId = firstString(requirement, "_tpl", "templateId");
    return Object.hasOwn(currenciesByTemplate, templateId);
  });
  const currencyTemplateId = monetaryRequirement
    ? firstString(monetaryRequirement, "_tpl", "templateId")
    : "";
  const currency = currenciesByTemplate[currencyTemplateId];
  const requirementPrice = monetaryRequirement
    ? firstNumber(monetaryRequirement, "count", "Count")
    : null;
  const price = requirementPrice ?? firstNumber(offer, "requirementsCost", "summaryCost", "price");
  const endTime = firstNumber(offer, "endTime", "EndTime");
  const loyaltyLevel = firstNumber(offer, "loyaltyLevel", "LoyaltyLevel");
  const traderLimit = firstNumber(offer, "buyRestrictionMax", "BuyRestrictionMax");
  const sellerNames = [
    firstString(user, "nickname", "Nickname", "name", "Name"),
    firstString(offer, "seller", "sellerName", "ownerName"),
  ].filter((name) => !["trader", "merchant", "comerciante", "vendedor"].includes(name.toLocaleLowerCase("en")));
  const sellerName = trader?.nickname || trader?.name || sellerNames[0] || (sellerIsTrader ? "Comerciante" : "Vendedor");

  return {
    id: firstString(offer, "_id", "id", "offerId", "Id"),
    itemId,
    itemName: item?.name || firstString(rootItem ?? {}, "name", "Name") || "Item",
    itemCount: Math.max(
      1,
      firstNumber(offer, "quantity", "Quantity", "count", "Count") ??
        firstNumber(rootUpd ?? {}, "StackObjectsCount") ??
        firstNumber(rootItem ?? {}, "count", "Count") ??
        1,
    ),
    seller: sellerName,
    sellerIsTrader,
    rating: firstNumber(user, "rating", "Rating"),
    conditionPercent:
      conditionValue !== null && conditionMaximum !== null && conditionMaximum > 0
        ? Math.min(100, Math.max(0, Math.round((conditionValue / conditionMaximum) * 100)))
        : null,
    conditionValue,
    conditionMaximum,
    foundInRaid: Boolean(rootUpd?.SpawnedInSession ?? rootUpd?.spawnedInSession ?? false),
    price,
    currencyTemplateId: currency ? currencyTemplateId : null,
    currencyLabel: currency?.label ?? "TROCA",
    barterItems: requirements
      .filter((requirement) => !Object.hasOwn(currenciesByTemplate, firstString(requirement, "_tpl", "templateId")))
      .map((requirement) => {
        const templateId = firstString(requirement, "_tpl", "templateId");
        const barterItem = catalogItems.get(templateId);
        const count = firstNumber(requirement, "count", "Count") ?? 1;
        return `${barterItem?.shortName ?? templateId} ×${formatNumber(count)}`;
      }),
    endTime: endTime === null ? null : endTime < 1_000_000_000_000 ? endTime * 1000 : endTime,
    traderLimit,
    loyaltyLevel,
    locked: Boolean(offer.locked ?? offer.isLocked ?? false),
    lockedReason: firstString(offer, "lockedReason", "LockedReason") || null,
  };
}

function formatRemainingTime(endTime: number | null, now: number) {
  if (endTime === null) return "—";
  const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
  if (remaining <= 0) return "EXPIRADO";
  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, "0")}m`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export default function Home() {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [items, setItems] = useState<StashItem[]>([]);
  const [traders, setTraders] = useState<TraderSummary[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyBalances | null>(null);
  const [fleaCatalog, setFleaCatalog] = useState<FleaCatalog>({ categories: [], items: [] });
  const [fleaCatalogLoading, setFleaCatalogLoading] = useState(false);
  const [fleaCategoryId, setFleaCategoryId] = useState<string | null>(null);
  const [fleaQuery, setFleaQuery] = useState("");
  const [selectedFleaItem, setSelectedFleaItem] = useState<FleaCatalogItem | null>(null);
  const [fleaOffers, setFleaOffers] = useState<FleaOfferView[]>([]);
  const [fleaClock, setFleaClock] = useState(Date.now());
  const [fleaOffersLoading, setFleaOffersLoading] = useState(false);
  const [fleaOfferCount, setFleaOfferCount] = useState<number | null>(null);
  const [lockedTraderOfferCount, setLockedTraderOfferCount] = useState(0);
  const [fleaPage, setFleaPage] = useState(0);
  const [fleaHasMore, setFleaHasMore] = useState(false);
  const [fleaOwnerType, setFleaOwnerType] = useState(0);
  const [excludeBartering, setExcludeBartering] = useState(true);
  const [fleaSort, setFleaSort] = useState("price-asc");
  const [fleaConditionFrom, setFleaConditionFrom] = useState(0);
  const [fleaConditionTo, setFleaConditionTo] = useState(100);
  const [purchaseOffer, setPurchaseOffer] = useState<FleaOfferView | null>(null);
  const [purchasingOffer, setPurchasingOffer] = useState(false);
  const [screen, setScreen] = useState<Screen>("characters");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Integration | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [openingProfile, setOpeningProfile] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  const fleaItemsById = useMemo(
    () => new Map(fleaCatalog.items.map((item) => [item.id, item])),
    [fleaCatalog.items],
  );
  const fleaCategoriesById = useMemo(
    () => new Map(fleaCatalog.categories.map((category) => [category.id, category])),
    [fleaCatalog.categories],
  );
  const fleaCategoryPath = useMemo(() => {
    const path = [];
    let category = fleaCategoryId ? fleaCategoriesById.get(fleaCategoryId) : undefined;
    while (category) {
      path.unshift(category);
      category = category.parentId ? fleaCategoriesById.get(category.parentId) : undefined;
    }
    return path;
  }, [fleaCategoriesById, fleaCategoryId]);
  const visibleFleaCategories = useMemo(
    () =>
      fleaCatalog.categories.filter(
        (category) => category.parentId === fleaCategoryId && category.itemCount > 0,
      ),
    [fleaCatalog.categories, fleaCategoryId],
  );
  const visibleFleaItems = useMemo(() => {
    const query = fleaQuery.trim().toLocaleLowerCase("pt-BR");
    const results = fleaCatalog.items.filter((item) =>
      query
        ? `${item.name} ${item.shortName}`.toLocaleLowerCase("pt-BR").includes(query)
        : item.categoryId === fleaCategoryId,
    );
    return query ? results.slice(0, 100) : results;
  }, [fleaCatalog.items, fleaCategoryId, fleaQuery]);
  const displayedFleaOffers = useMemo(() => {
    const sorted = [...fleaOffers];
    if (fleaSort === "price-asc") {
      sorted.sort((left, right) => (left.price ?? Number.MAX_SAFE_INTEGER) - (right.price ?? Number.MAX_SAFE_INTEGER));
    } else if (fleaSort === "price-desc") {
      sorted.sort((left, right) => (right.price ?? -1) - (left.price ?? -1));
    } else if (fleaSort === "expiry") {
      sorted.sort((left, right) => (left.endTime ?? Number.MAX_SAFE_INTEGER) - (right.endTime ?? Number.MAX_SAFE_INTEGER));
    }
    return sorted;
  }, [fleaOffers, fleaSort]);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/profiles", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Falha ao carregar perfis.");
        return result.profiles as PlayerProfile[];
      }),
    ])
      .then(async ([profilesResult]) => {
        const sessionResponse = await fetch("/api/session", { cache: "no-store" });
        const sessionResult = await sessionResponse.json();
        if (!sessionResponse.ok) throw new Error(sessionResult.error ?? "Falha ao restaurar a sessão.");
        if (!active) return;
        setProfiles(profilesResult);
        const savedProfileId =
          typeof sessionResult.profileId === "string" &&
          profilesResult.some((profile) => profile.id === sessionResult.profileId)
            ? sessionResult.profileId
            : "";
        setProfileId(savedProfileId);
        setScreen(savedProfileId ? "stash" : "characters");
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Falha de comunicação local.");
      })
      .finally(() => {
        if (active) setLoadingProfiles(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profileId) {
      setFleaCatalog({ categories: [], items: [] });
      return;
    }

    let active = true;
    setFleaCatalogLoading(true);
    Promise.all([
      fetch("/api/market/catalog", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Falha ao carregar categorias do flea.");
        return result as FleaCatalog;
      }),
      fetch("/api/health", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Falha ao verificar a integração.");
        return result.integration as Integration;
      }),
    ])
      .then(([catalog, integration]) => {
        if (!active) return;
        setFleaCatalog(catalog);
        setStatus(integration);
      })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Falha ao carregar dados locais.");
      })
      .finally(() => {
        if (active) setFleaCatalogLoading(false);
      });

    return () => {
      active = false;
    };
  }, [profileId]);

  const loadProfileData = useCallback(async () => {
    if (!profileId) return;
    setLoadingData(true);
    setError("");
    setCurrencies(null);

    try {
      const [stashResponse, tradersResponse, currenciesResponse] = await Promise.all([
        fetch(`/api/profiles/${profileId}/stash`, { cache: "no-store" }),
        fetch(`/api/profiles/${profileId}/traders`, { cache: "no-store" }),
        fetch(`/api/profiles/${profileId}/currencies`, { cache: "no-store" }),
      ]);
      const stashResult = await stashResponse.json();
      const tradersResult = await tradersResponse.json();
      const currenciesResult = await currenciesResponse.json();

      if (!stashResponse.ok) throw new Error(stashResult.error ?? "Falha ao carregar stash.");
      if (!tradersResponse.ok) throw new Error(tradersResult.error ?? "Falha ao carregar comerciantes.");
      if (!currenciesResponse.ok) throw new Error(currenciesResult.error ?? "Falha ao carregar moedas.");
      setItems(stashResult.items as StashItem[]);
      setTraders(tradersResult.traders as TraderSummary[]);
      setCurrencies(currenciesResult.currencies as CurrencyBalances);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha de comunicação com o SPT local.");
      setItems([]);
      setTraders([]);
      setCurrencies(null);
    } finally {
      setLoadingData(false);
    }
  }, [profileId]);

  useEffect(() => {
    void loadProfileData();
  }, [loadProfileData]);

  useEffect(() => {
    if (fleaOffers.length === 0) return;
    const timer = setInterval(() => setFleaClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [fleaOffers.length]);

  async function searchFleaOffers(
    item: FleaCatalogItem,
    page = 0,
    append = false,
    options: FleaSearchOptions = {},
  ) {
    if (!profileId) {
      setError("Selecione um personagem antes de pesquisar no flea.");
      return;
    }

    const ownerType = options.ownerType ?? fleaOwnerType;
    const excludeBarteringOffers = options.excludeBartering ?? excludeBartering;
    const sort = options.sort ?? fleaSort;
    const conditionFrom = options.conditionFrom ?? fleaConditionFrom;
    const conditionTo = options.conditionTo ?? fleaConditionTo;
    setSelectedFleaItem(item);
    setFleaCategoryId(item.categoryId);
    setFleaOffersLoading(true);
    setError("");
    setNotice("");
    if (!append) {
      setFleaOffers([]);
      setFleaOfferCount(null);
      setLockedTraderOfferCount(0);
    }

    try {
      const response = await fetch("/api/market/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            page,
            pageId: page,
            limit: 100,
            sortType: sort === "expiry" ? 5 : 4,
            sortDirection: sort === "price-desc" ? 1 : 0,
            currency: 0,
            priceFrom: 0,
            priceTo: 999999999,
            quantityFrom: 1,
            quantityTo: 999999,
            conditionFrom,
            conditionTo,
            oneHourExpiration: false,
            oneHourExpire: false,
            removeBartering: excludeBarteringOffers,
            offerOwnerType: ownerType,
            onlyFunctional: false,
            updateOfferCount: true,
            handbookId: item.id,
            linkedSearchId: "",
            neededSearchId: "",
            buildItems: {},
            buildCount: 0,
            tm: 1,
          },
        }),
      });
      const result: unknown = await response.json();
      if (!response.ok) {
        const details = asRecord(result);
        throw new Error(
          firstString(details ?? {}, "message", "error") || "O servidor SPT não conseguiu pesquisar as ofertas.",
        );
      }

      const searchResult = getOffersResponse(result);
      const offers = searchResult.offers.map((offer) =>
        normalizeFleaOffer(offer, fleaItemsById, traders),
      );
      let lockedOffers: FleaOfferView[] = [];
      if (!append && page === 0 && ownerType !== 2) {
        const lockedResponse = await fetch(
          `/api/market/locked-offers?templateId=${encodeURIComponent(item.id)}`,
          { cache: "no-store" },
        );
        const lockedResult: unknown = await lockedResponse.json();
        if (!lockedResponse.ok) {
          const details = asRecord(lockedResult);
          throw new Error(
            firstString(details ?? {}, "message", "error") ||
              "Não foi possível consultar as ofertas bloqueadas dos comerciantes.",
          );
        }

        const lockedData = asRecord(lockedResult);
        const rawLockedOffers = Array.isArray(lockedData?.offers)
          ? lockedData.offers
              .map(asRecord)
              .filter((offer): offer is Record<string, unknown> => offer !== null)
          : [];
        lockedOffers = rawLockedOffers
          .map((offer) => normalizeFleaOffer(offer, fleaItemsById, traders));
        lockedOffers = lockedOffers.filter(
          (offer) =>
            offer.conditionPercent === null ||
            (offer.conditionPercent >= conditionFrom && offer.conditionPercent <= conditionTo),
        );
      }

      const allOffers = [...offers, ...lockedOffers];
      setFleaOffers((current) => (append ? [...current, ...offers] : allOffers));
      setFleaPage(page);
      setFleaOfferCount(searchResult.count);
      if (!append) setLockedTraderOfferCount(lockedOffers.length);
      setFleaHasMore(
        searchResult.count !== null
          ? (page + 1) * 100 < searchResult.count
          : offers.length === 100,
      );
      if (allOffers.length === 0 && !append) {
        setNotice("Nenhuma oferta encontrada para este item com os filtros atuais.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha de comunicação com o servidor SPT.");
      if (!append) setFleaOffers([]);
      setFleaHasMore(false);
    } finally {
      setFleaOffersLoading(false);
    }
  }

  async function confirmFleaPurchase() {
    if (!purchaseOffer || !profileId || !purchaseOffer.currencyTemplateId || !purchaseOffer.price) {
      setError("Esta oferta não possui pagamento em moeda suportada pelo sistema de compra.");
      return;
    }

    setPurchasingOffer(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/market/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: {
            offerId: purchaseOffer.id,
            currencyTemplateId: purchaseOffer.currencyTemplateId,
            price: purchaseOffer.price,
          },
        }),
      });
      const result: unknown = await response.json();
      const details = asRecord(result);
      if (!response.ok) {
        throw new Error(firstString(details ?? {}, "message", "error") || "O servidor SPT recusou a compra.");
      }

      const transactionData = asRecord(details?.data) ?? details;
      const badRequests = transactionData?.badRequest ?? transactionData?.BadRequest;
      if (Array.isArray(badRequests) && badRequests.length > 0) {
        const firstFailure = asRecord(badRequests[0]);
        throw new Error(
          firstString(firstFailure ?? {}, "errmsg", "message") || "O servidor SPT recusou a compra.",
        );
      }

      setNotice("O servidor SPT processou a compra. Atualize o stash para conferir o item.");
      setPurchaseOffer(null);
      await loadProfileData();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao concluir a compra no servidor SPT.");
    } finally {
      setPurchasingOffer(false);
    }
  }

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return items;
    return items.filter(
      (item) =>
        item.name.toLocaleLowerCase("pt-BR").includes(query) ||
        item.shortName.toLocaleLowerCase("pt-BR").includes(query),
    );
  }, [items, search]);

  async function requestMarketAction(operation: string) {
    setNotice("");
    setError("");
    try {
      const response = await fetch(`/api/market/${operation}`, { method: "POST" });
      const result = await response.json();
      setNotice(result.message ?? result.error ?? "Operação indisponível.");
    } catch {
      setNotice("Não foi possível alcançar a API local.");
    }
  }

  async function enterProfile(nextProfileId: string) {
    setOpeningProfile(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: nextProfileId }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Não foi possível abrir o perfil.");
      }

      setProfileId(result.profileId as string);
      setScreen("stash");
      setItems([]);
      setTraders([]);
      setCurrencies(null);
      setStatus(null);
      setFleaCatalog({ categories: [], items: [] });
      setFleaCategoryId(null);
      setFleaOffers([]);
      setSelectedFleaItem(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível abrir o perfil.");
    } finally {
      setOpeningProfile(false);
    }
  }

  async function exitProfile() {
    try {
      const response = await fetch("/api/session", { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Não foi possível encerrar a sessão.");

      setProfileId("");
      setScreen("characters");
      setItems([]);
      setTraders([]);
      setCurrencies(null);
      setFleaCatalog({ categories: [], items: [] });
      setFleaOffers([]);
      setSelectedFleaItem(null);
      setStatus(null);
      setError("");
      setNotice("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível encerrar a sessão.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="rail">
        <div className="brand-mark">S</div>
        <div className="rail-label">LOCAL</div>
        <div className="rail-spacer" />
        <div className="rail-status"><span className="status-dot" />SPT</div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="brand">
            <div className="brand-symbol">◆</div>
            <div>
              <strong>SPT<span> / </span>MARKET</strong>
              <small>LOCAL TRADING TERMINAL</small>
            </div>
          </div>
          <div className="topbar-center">
            <span className="live-indicator" />
            <span>INSTÂNCIA LOCAL</span>
            <span className="topbar-separator">/</span>
            <span>SPT 4.1.6</span>
          </div>
          {profileId && (
            <div className="profile-picker">
              <div className="profile-emblem">{selectedProfile?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
              <label htmlFor="profile-select">
                <small>PERSONAGEM ATIVO</small>
                <select
                  id="profile-select"
                  value={profileId}
                  onChange={(event) => void enterProfile(event.target.value)}
                  disabled={loadingProfiles || openingProfile || profiles.length === 0}
                >
                  {profiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name} — Nv. {profile.level}
                    </option>
                  ))}
                </select>
              </label>
              <span className="chevron">⌄</span>
              <button className="text-button" onClick={() => void exitProfile()} disabled={openingProfile}>
                SAIR
              </button>
            </div>
          )}
        </header>

        {profileId && (
          <nav className="main-nav" aria-label="Seções">
            {screens.map((entry, index) => (
              <button
                className={`nav-tab ${screen === entry.id ? "active" : ""}`}
                key={entry.id}
                onClick={() => {
                  setScreen(entry.id);
                  setSearch("");
                  setNotice("");
                  setError("");
                }}
              >
                <span className="nav-index">0{index + 1}</span>
                <span className="nav-short">{entry.short}</span>
                {entry.label}
                {screen === entry.id && <i />}
              </button>
            ))}
            <div className="nav-right">
              <span className="profile-identity">{selectedProfile?.faction ?? "—"}</span>
              <span className="profile-level">LVL {selectedProfile?.level ?? "—"}</span>
            </div>
          </nav>
        )}
        {profileId && (
          <div className="currency-bar" aria-label="Saldo de moedas do personagem">
            <span className="currency-heading">SALDO DO PERSONAGEM</span>
            <div className="currency-list">
              <span className="currency-pill" aria-label={`Rublos: ${currencies?.rubles ?? "carregando"}`}>
                <b>₽</b> Rublos <strong>{currencies ? formatNumber(currencies.rubles) : "—"}</strong>
              </span>
              <span className="currency-pill" aria-label={`Dólares: ${currencies?.dollars ?? "carregando"}`}>
                <b>$</b> Dólares <strong>{currencies ? formatNumber(currencies.dollars) : "—"}</strong>
              </span>
              <span className="currency-pill" aria-label={`Euros: ${currencies?.euros ?? "carregando"}`}>
                <b>€</b> Euros <strong>{currencies ? formatNumber(currencies.euros) : "—"}</strong>
              </span>
              <span className="currency-pill" aria-label={`GP Coins: ${currencies?.gpCoins ?? "carregando"}`}>
                <b>GP</b> GP Coins <strong>{currencies ? formatNumber(currencies.gpCoins) : "—"}</strong>
              </span>
            </div>
          </div>
        )}

        <section className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">TERMINAL / {screen.toUpperCase()}</div>
              <h1>{screen === "characters" ? "PERSONAGENS" : screen === "stash" ? "INVENTÁRIO" : screen === "flea" ? "FLEA MARKET" : "COMERCIANTES"}</h1>
              <p>
                {screen === "characters"
                  ? "Selecione o perfil local que deseja gerenciar."
                  : screen === "stash"
                  ? "Seu estoque pessoal, sincronizado em modo somente leitura."
                  : screen === "flea"
                    ? "Navegue pelas categorias, consulte ofertas reais e compre com confirmação."
                    : "Reputação e acesso aos comerciantes do seu perfil."}
              </p>
            </div>
            {profileId && (
              <div className={`connection-badge ${status?.connectorInstalled ? "connected" : "readonly"}`}>
                <span className="status-dot" />
                {status?.connectorInstalled ? "CONECTOR ONLINE" : "LEITURA LOCAL"}
              </div>
            )}
          </div>

          {(error || notice) && (
            <div className={`notice ${error ? "notice-error" : ""}`} role="status">
              <span>!</span>{error || notice}
            </div>
          )}

          {screen === "characters" && (
            <section className="character-select">
              <div className="character-select-heading">
                <div>
                  <div className="eyebrow">SPT LAUNCHER / PERFIS LOCAIS</div>
                  <h2>SELECIONE SEU PERSONAGEM</h2>
                </div>
                <span>{profiles.length.toString().padStart(2, "0")} PERFIS DETECTADOS</span>
              </div>
              {loadingProfiles ? (
                <div className="panel character-loading"><span className="loader" />LENDO PERFIS LOCAIS…</div>
              ) : profiles.length === 0 ? (
                <div className="panel character-loading">NENHUM PERFIL SPT ENCONTRADO. CONFIRA SPT_ROOT.</div>
              ) : (
                <div className="character-grid">
                  {profiles.map((profile, index) => (
                    <article className={`character-card ${profile.id === profileId ? "selected" : ""}`} key={profile.id}>
                      <div className="character-card-top">
                        <span className="character-number">PMC / {String(index + 1).padStart(2, "0")}</span>
                        <span className="character-level">LVL {profile.level}</span>
                      </div>
                      <div className="character-portrait">{profile.name.slice(0, 1).toUpperCase()}</div>
                      <h3>{profile.name}</h3>
                      <div className="character-edition">{profile.edition}</div>
                      <div className="character-data">
                        <span>FACÇÃO <b>{profile.faction}</b></span>
                        <span>PERFIL <b>{profile.id.slice(0, 8).toUpperCase()}</b></span>
                      </div>
                      <button
                        className="character-enter"
                        onClick={() => void enterProfile(profile.id)}
                        disabled={openingProfile}
                      >
                        {openingProfile ? "ABRINDO PERFIL…" : profile.id === profileId ? "CONTINUAR COM ESTE PERFIL" : "ABRIR PERFIL"}
                        <span>↗</span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <div className="character-disclaimer">
                <span className="status-dot" /> PERFIS SÃO LIDOS LOCALMENTE · COMPRAS CONFIRMADAS SÃO EXECUTADAS PELO SPT
              </div>
            </section>
          )}

          {screen === "stash" && (
            <section className="panel inventory-panel">
              <div className="panel-toolbar">
                <div className="panel-title">
                  <span className="panel-mark">01</span>
                  <div><strong>STASH</strong><small>INVENTÁRIO PMC</small></div>
                </div>
                <div className="inventory-meta">
                  <span>{formatNumber(items.length)} <small>ITENS</small></span>
                  <span className="meta-divider" />
                  <span>{selectedProfile?.edition ?? "—"}</span>
                </div>
                <div className="search-box">
                  <span>⌕</span>
                  <input
                    aria-label="Buscar item no stash"
                    placeholder="BUSCAR ITEM..."
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                  {search && <button aria-label="Limpar busca" onClick={() => setSearch("")}>×</button>}
                </div>
                <button className="icon-button" aria-label="Atualizar dados do perfil" onClick={() => void loadProfileData()}>↻</button>
              </div>
              <div className="inventory-grid-wrap">
                {loadingData ? (
                  <div className="empty-state"><span className="loader" />LENDO PERFIL LOCAL…</div>
                ) : filteredItems.length === 0 ? (
                  <div className="empty-state">
                    <span className="empty-cross">＋</span>
                    {items.length === 0 ? "NENHUM ITEM NO STASH" : "NENHUM ITEM ENCONTRADO"}
                  </div>
                ) : (
                  <div className="stash-grid">
                    {filteredItems.map((item, index) => (
                      <article
                        className="stash-item"
                        key={item.id}
                        style={{
                          gridColumn: `${Math.min(10, Math.max(1, (item.x ?? (index % 10)) + 1))} / span ${Math.min(item.width, 10)}`,
                          gridRow: `${(item.y ?? Math.floor(index / 10)) + 1} / span ${Math.min(item.height, 4)}`,
                        }}
                        title={`${item.name}${item.stackCount > 1 ? ` × ${item.stackCount}` : ""}`}
                      >
                        <span className="item-index">{item.shortName.slice(0, 2).toUpperCase()}</span>
                        <span className="item-name">{item.name}</span>
                        {item.stackCount > 1 && <span className="item-count">×{formatNumber(item.stackCount)}</span>}
                        <span className="item-coord">{item.templateId.slice(0, 6)}</span>
                      </article>
                    ))}
                  </div>
                )}
              </div>
              <div className="panel-footer">
                <span><i className="status-dot" /> DADOS LOCAIS DO PERFIL</span>
                <span>COMPRAS DO FLEA SÃO PROCESSADAS PELO SERVIDOR SPT</span>
              </div>
            </section>
          )}

          {screen === "flea" && (
            <section className="market-layout">
              <aside className="panel flea-browser">
                <div className="panel-title">
                  <span className="panel-mark">02</span>
                  <div><strong>CATÁLOGO DE ITENS</strong><small>CATEGORIAS DO SPT</small></div>
                </div>
                <div className="search-box full">
                  <span>⌕</span>
                  <input
                    id="flea-query"
                    aria-label="Buscar item no catálogo do flea"
                    placeholder="Digite o nome do item..."
                    value={fleaQuery}
                    onChange={(event) => setFleaQuery(event.target.value)}
                  />
                  {fleaQuery && <button aria-label="Limpar busca de itens" onClick={() => setFleaQuery("")}>×</button>}
                </div>
                {!fleaQuery && (
                  <div className="flea-breadcrumbs" aria-label="Caminho das categorias">
                    <button className={!fleaCategoryId ? "active" : ""} onClick={() => setFleaCategoryId(null)}>
                      TODAS
                    </button>
                    {fleaCategoryPath.map((category) => (
                      <button
                        key={category.id}
                        className={category.id === fleaCategoryId ? "active" : ""}
                        onClick={() => setFleaCategoryId(category.id)}
                      >
                        / {category.name}
                      </button>
                    ))}
                  </div>
                )}
                <div className="flea-catalog-list">
                  {fleaCatalogLoading ? (
                    <div className="empty-state"><span className="loader" />CARREGANDO CATEGORIAS…</div>
                  ) : fleaQuery && visibleFleaItems.length === 0 ? (
                    <div className="empty-state">NENHUM ITEM ENCONTRADO</div>
                  ) : !fleaQuery && visibleFleaCategories.length === 0 && visibleFleaItems.length === 0 ? (
                    <div className="empty-state">ESTA CATEGORIA NÃO CONTÉM ITENS</div>
                  ) : (
                    <>
                      {!fleaQuery && visibleFleaCategories.map((category) => (
                        <button
                          className="flea-category-row"
                          key={category.id}
                          onClick={() => setFleaCategoryId(category.id)}
                        >
                          <span className="category-chevron">›</span>
                          <span>{category.name}</span>
                          <small>{formatNumber(category.itemCount)}</small>
                        </button>
                      ))}
                      {visibleFleaItems.map((item) => (
                        <button
                          className={`flea-item-row ${selectedFleaItem?.id === item.id ? "selected" : ""}`}
                          key={item.id}
                          onClick={() => void searchFleaOffers(item)}
                          disabled={fleaOffersLoading}
                        >
                          <span className="market-item-icon">
                            <span>{item.shortName.slice(0, 2).toUpperCase()}</span>
                            <img
                              src={`https://assets.tarkov.dev/${item.id}-icon.webp`}
                              alt=""
                              loading="lazy"
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                              }}
                            />
                          </span>
                          <span className="flea-item-name">{item.name}</span>
                          <span className="flea-item-arrow">⌕</span>
                        </button>
                      ))}
                      {fleaQuery && visibleFleaItems.length === 100 && (
                        <div className="catalog-limit">Exibindo os primeiros 100 resultados.</div>
                      )}
                    </>
                  )}
                </div>
                <div className="catalog-footer">
                  {fleaQuery
                    ? `${formatNumber(visibleFleaItems.length)} RESULTADOS`
                    : `${formatNumber(fleaCatalog.items.length)} ITENS NO CATÁLOGO`}
                </div>
              </aside>
              <div className="panel offers-panel">
                <div className="offers-toolbar">
                  <div className="selected-market-item">
                    {selectedFleaItem ? (
                      <>
                        <span className="market-item-icon large">
                          <span>{selectedFleaItem.shortName.slice(0, 2).toUpperCase()}</span>
                          <img
                            src={`https://assets.tarkov.dev/${selectedFleaItem.id}-icon.webp`}
                            alt=""
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </span>
                        <span><strong>{selectedFleaItem.name}</strong><small>OFERTAS SPT E TRADERS BLOQUEADOS</small></span>
                      </>
                    ) : (
                      <span className="offers-prompt">Selecione um item para consultar as ofertas</span>
                    )}
                  </div>
                  <button
                    className="text-button"
                    onClick={() => selectedFleaItem && void searchFleaOffers(selectedFleaItem)}
                    disabled={!selectedFleaItem || fleaOffersLoading}
                  >
                    {fleaOffersLoading ? "BUSCANDO…" : "↻ ATUALIZAR"}
                  </button>
                </div>
                <div className="market-filters-row">
                  <label>
                    VENDEDOR
                    <select
                      className="select-field"
                      value={fleaOwnerType}
                      onChange={(event) => {
                        const ownerType = Number(event.target.value);
                        setFleaOwnerType(ownerType);
                        if (selectedFleaItem) {
                          void searchFleaOffers(selectedFleaItem, 0, false, { ownerType });
                        }
                      }}
                    >
                      <option value={0}>Todos</option>
                      <option value={2}>Jogadores</option>
                      <option value={1}>Comerciantes</option>
                    </select>
                  </label>
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={excludeBartering}
                      onChange={(event) => {
                        const excludeBartering = event.target.checked;
                        setExcludeBartering(excludeBartering);
                        if (selectedFleaItem) {
                          void searchFleaOffers(selectedFleaItem, 0, false, { excludeBartering });
                        }
                      }}
                    />
                    Excluir trocas
                  </label>
                  <label>
                    ORDENAR
                    <select
                      className="select-field"
                      value={fleaSort}
                      onChange={(event) => {
                        const sort = event.target.value;
                        setFleaSort(sort);
                        if (selectedFleaItem) {
                          void searchFleaOffers(selectedFleaItem, 0, false, { sort });
                        }
                      }}
                    >
                      <option value="price-asc">Menor preço</option>
                      <option value="price-desc">Maior preço</option>
                      <option value="expiry">Expiração</option>
                    </select>
                  </label>
                  <div className="condition-filter" role="group" aria-label="Filtrar por condição do item">
                    <span>CONDIÇÃO</span>
                    <label>
                      <span>DE</span>
                      <input
                        aria-label="Condição mínima"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={fleaConditionFrom}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          const input = event.currentTarget;
                          if (
                            /^\d$/.test(event.key) &&
                            input.value === "0" &&
                            (input.selectionStart !== 0 || input.selectionEnd !== input.value.length)
                          ) {
                            input.select();
                          }
                        }}
                        onChange={(event) => {
                          const enteredValue = event.target.value.replace(/\D/g, "");
                          const conditionFrom = Math.min(100, Math.max(0, Number(enteredValue || 0)));
                          const conditionTo = Math.max(fleaConditionTo, conditionFrom);
                          setFleaConditionFrom(conditionFrom);
                          setFleaConditionTo(conditionTo);
                          if (selectedFleaItem) {
                            void searchFleaOffers(selectedFleaItem, 0, false, {
                              conditionFrom,
                              conditionTo,
                            });
                          }
                        }}
                      />
                      <span>%</span>
                    </label>
                    <label>
                      <span>ATÉ</span>
                      <input
                        aria-label="Condição máxima"
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={fleaConditionTo}
                        onFocus={(event) => event.currentTarget.select()}
                        onKeyDown={(event) => {
                          const input = event.currentTarget;
                          if (
                            /^\d$/.test(event.key) &&
                            input.value === "0" &&
                            (input.selectionStart !== 0 || input.selectionEnd !== input.value.length)
                          ) {
                            input.select();
                          }
                        }}
                        onChange={(event) => {
                          const enteredValue = event.target.value.replace(/\D/g, "");
                          const conditionTo = Math.min(100, Math.max(0, Number(enteredValue || 0)));
                          const conditionFrom = Math.min(fleaConditionFrom, conditionTo);
                          setFleaConditionFrom(conditionFrom);
                          setFleaConditionTo(conditionTo);
                          if (selectedFleaItem) {
                            void searchFleaOffers(selectedFleaItem, 0, false, {
                              conditionFrom,
                              conditionTo,
                            });
                          }
                        }}
                      />
                      <span>%</span>
                    </label>
                  </div>
                </div>
                <div className="offers-summary">
                  {selectedFleaItem
                    ? error
                      ? "BUSCA NÃO CONCLUÍDA"
                      : `${formatNumber(
                          fleaOfferCount === null
                            ? fleaOffers.length
                            : fleaOfferCount + lockedTraderOfferCount,
                        )} OFERTAS${lockedTraderOfferCount > 0 ? ` · ${formatNumber(lockedTraderOfferCount)} BLOQUEADAS` : ""}`
                    : "AGUARDANDO ITEM"}
                </div>
                <div className="offers-list">
                  {fleaOffersLoading ? (
                    <div className="empty-state"><span className="loader" />CONSULTANDO O SERVIDOR SPT…</div>
                  ) : !selectedFleaItem ? (
                    <div className="market-empty">
                      <div className="empty-orbit">⌕</div>
                      <strong>ESCOLHA UM ITEM</strong>
                      <p>Use a busca ou navegue pelas categorias para carregar ofertas reais do servidor SPT.</p>
                    </div>
                  ) : error ? (
                    <div className="empty-state">CONSULTA INTERROMPIDA — VERIFIQUE O AVISO ACIMA</div>
                  ) : displayedFleaOffers.length === 0 ? (
                    <div className="empty-state">NENHUMA OFERTA DISPONÍVEL</div>
                  ) : (
                    displayedFleaOffers.map((offer) => {
                      const expired = offer.endTime !== null && offer.endTime <= fleaClock;
                      const canBuy =
                        Boolean(offer.id) &&
                        Boolean(offer.currencyTemplateId) &&
                        offer.barterItems.length === 0 &&
                        offer.price !== null &&
                        offer.price > 0 &&
                        !offer.locked &&
                        !expired;
                      return (
                        <article className={`market-offer-row ${offer.locked || expired ? "unavailable" : ""}`} key={offer.id || `${offer.itemId}-${offer.seller}`}>
                          <span className="market-item-icon offer">
                            <span>{offer.itemName.slice(0, 2).toUpperCase()}</span>
                            {offer.itemId && (
                              <img
                                src={`https://assets.tarkov.dev/${offer.itemId}-icon.webp`}
                                alt=""
                                loading="lazy"
                                onError={(event) => {
                                  event.currentTarget.style.display = "none";
                                }}
                              />
                            )}
                          </span>
                          <div className="offer-item-details">
                            <strong>{offer.itemName}</strong>
                            <span>Quantidade: {formatNumber(offer.itemCount)}</span>
                            {offer.conditionPercent !== null ? (
                              <span>
                                Condição:{" "}
                                {offer.conditionValue !== null && offer.conditionMaximum !== null
                                  ? `${formatNumber(offer.conditionValue)}/${formatNumber(offer.conditionMaximum)} · `
                                  : ""}
                                {offer.conditionPercent}%
                              </span>
                            ) : offer.foundInRaid ? (
                              <span className="found-in-raid">ENCONTRADO EM RAID</span>
                            ) : (
                              <span>Estado padrão</span>
                            )}
                            {offer.barterItems.length > 0 && (
                              <span className="barter-details">Troca: {offer.barterItems.join(" + ")}</span>
                            )}
                            {offer.lockedReason && <span className="barter-details">{offer.lockedReason}</span>}
                          </div>
                          <div className="offer-seller">
                            <strong>{offer.seller}</strong>
                            <span className={offer.sellerIsTrader ? "seller-trader" : "seller-player"}>
                              {offer.sellerIsTrader ? "COMERCIANTE" : "JOGADOR"}
                            </span>
                            {offer.rating !== null && <span>Reputação {offer.rating.toFixed(2)}</span>}
                            {offer.sellerIsTrader && offer.traderLimit !== null && (
                              <span>Limite: {formatNumber(offer.traderLimit)} · Nv. {offer.loyaltyLevel ?? "—"}</span>
                            )}
                          </div>
                          <div className="offer-price">
                            <strong>
                              {offer.price === null
                                ? "—"
                                : `${currenciesByTemplate[offer.currencyTemplateId ?? ""]?.symbol ?? ""}${formatNumber(offer.price)}`}
                            </strong>
                            <span>{offer.currencyLabel}{offer.itemCount > 1 && offer.price !== null ? ` · ${formatNumber(Math.ceil(offer.price / offer.itemCount))}/un.` : ""}</span>
                          </div>
                          <div className="offer-expiry">
                            <span>EXPIRA EM</span>
                            <strong>{formatRemainingTime(offer.endTime, fleaClock)}</strong>
                          </div>
                          <button
                            className="offer-buy-button"
                            onClick={() => setPurchaseOffer(offer)}
                            disabled={!canBuy}
                            title={
                              offer.barterItems.length > 0 || !offer.currencyTemplateId
                                ? "Compras de ofertas por troca ainda não são suportadas."
                                : undefined
                            }
                          >
                            {offer.locked ? "BLOQUEADO" : expired ? "EXPIRADO" : "COMPRAR"}
                          </button>
                        </article>
                      );
                    })
                  )}
                  {fleaHasMore && !fleaOffersLoading && (
                    <button
                      className="load-more-offers"
                      onClick={() => selectedFleaItem && void searchFleaOffers(selectedFleaItem, fleaPage + 1, true)}
                    >
                      CARREGAR MAIS OFERTAS
                    </button>
                  )}
                </div>
                <div className="panel-footer">
                  <span><i className="status-dot" /> OFERTAS DO SPT{lockedTraderOfferCount > 0 ? " E ASSORT BLOQUEADO" : ""}</span>
                  <span>{selectedFleaItem ? `${formatNumber(fleaOffers.length)} CARREGADAS` : "SOMENTE OFERTAS REAIS"}</span>
                </div>
              </div>
            </section>
          )}

          {screen === "traders" && (
            <section className="panel traders-panel">
              <div className="traders-toolbar">
                <div className="panel-title">
                  <span className="panel-mark">03</span>
                  <div><strong>COMERCIANTES</strong><small>PROGRESSO DO PERSONAGEM</small></div>
                </div>
                <div className="search-box">
                  <span>⌕</span><input placeholder="FILTRAR COMERCIANTE..." value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
              </div>
              <div className="trader-grid">
                {traders.filter((trader) => trader.name.toLowerCase().includes(search.toLowerCase())).map((trader, index) => (
                  <article className="trader-card" key={trader.id}>
                    <div className="trader-avatar">{trader.name.slice(0, 1).toUpperCase()}</div>
                    <div className="trader-details">
                      <span className="trader-rank">TRADER / {String(index + 1).padStart(2, "0")}</span>
                      <strong>{trader.name}</strong>
                      <div className="trader-standing">
                        <span>REPUTAÇÃO</span>
                        <span>{trader.standing.toFixed(2)}</span>
                      </div>
                      <div className="loyalty-track"><i style={{ width: `${Math.min(100, trader.loyaltyLevel * 25)}%` }} /></div>
                      <div className="trader-card-foot">
                        <span>NÍVEL DE LEALDADE <b>{trader.loyaltyLevel || "—"}</b></span>
                        <span className={trader.unlocked ? "unlocked" : "locked"}>{trader.unlocked ? "ACESSÍVEL" : "BLOQUEADO"}</span>
                      </div>
                    </div>
                    <button className="trader-open" onClick={() => void requestMarketAction("trader-catalog")} aria-label={`Abrir ${trader.name}`}>↗</button>
                  </article>
                ))}
                {!loadingData && traders.length === 0 && <div className="empty-state">DADOS DE COMERCIANTES INDISPONÍVEIS</div>}
              </div>
              <div className="traders-note">
                <span>ⓘ</span> Catálogo, compras e vendas nos comerciantes também dependem da integração com o servidor.
              </div>
            </section>
          )}
        </section>

        {purchaseOffer && (
          <div className="purchase-backdrop" role="presentation">
            <section className="purchase-dialog" role="dialog" aria-modal="true" aria-labelledby="purchase-title">
              <div className="eyebrow">TRANSAÇÃO NO SERVIDOR SPT</div>
              <h2 id="purchase-title">CONFIRMAR COMPRA</h2>
              <p>
                Comprar <strong>{purchaseOffer.itemName}</strong>
                {purchaseOffer.itemCount > 1 && ` · ${formatNumber(purchaseOffer.itemCount)} unidades`}
                {" "}de <strong>{purchaseOffer.seller}</strong>?
              </p>
              <div className="purchase-total">
                <span>PREÇO TOTAL</span>
                <strong>
                  {currenciesByTemplate[purchaseOffer.currencyTemplateId ?? ""]?.symbol ?? ""}
                  {purchaseOffer.price === null ? "—" : formatNumber(purchaseOffer.price)} {purchaseOffer.currencyLabel}
                </strong>
              </div>
              <div className="purchase-actions">
                <button className="secondary-button" onClick={() => setPurchaseOffer(null)} disabled={purchasingOffer}>
                  CANCELAR
                </button>
                <button className="primary-button" onClick={() => void confirmFleaPurchase()} disabled={purchasingOffer}>
                  {purchasingOffer ? "ENVIANDO AO SPT…" : "CONFIRMAR COMPRA"}
                </button>
              </div>
            </section>
          </div>
        )}

        <footer className="statusbar">
          <span><b>SPT MARKET</b> <i>◆</i> WEB CLIENT</span>
          <span className="statusbar-center"><i className="status-dot" /> CONEXÃO LOCAL · COMPRAS VIA SPT</span>
          <span>BUILD 0.1.0</span>
        </footer>
      </section>
    </main>
  );
}
