"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CurrencyBalances, PlayerProfile, StashItem, TraderSummary } from "@/lib/spt-data";

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

const screens: Array<{ id: Screen; label: string; short: string }> = [
  { id: "characters", label: "PERSONAGENS", short: "CH" },
  { id: "stash", label: "STASH", short: "ST" },
  { id: "flea", label: "FLEA MARKET", short: "FM" },
  { id: "traders", label: "TRADERS", short: "TR" },
];

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

export default function Home() {
  const [profiles, setProfiles] = useState<PlayerProfile[]>([]);
  const [profileId, setProfileId] = useState("");
  const [items, setItems] = useState<StashItem[]>([]);
  const [traders, setTraders] = useState<TraderSummary[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyBalances | null>(null);
  const [screen, setScreen] = useState<Screen>("characters");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<Integration | null>(null);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selectedProfile = profiles.find((profile) => profile.id === profileId);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/profiles", { cache: "no-store" }).then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Falha ao carregar perfis.");
        return result.profiles as PlayerProfile[];
      }),
      fetch("/api/health", { cache: "no-store" }).then((response) => response.json()),
    ])
      .then(([profilesResult, health]) => {
        if (!active) return;
        setProfiles(profilesResult);
        setProfileId(profilesResult[0]?.id ?? "");
        setStatus(health.integration as Integration);
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
          <div className="profile-picker">
            <div className="profile-emblem">{selectedProfile?.name.slice(0, 1).toUpperCase() ?? "?"}</div>
            <label htmlFor="profile-select">
              <small>PERSONAGEM ATIVO</small>
              <select
                id="profile-select"
                value={profileId}
                onChange={(event) => {
                  setProfileId(event.target.value);
                  setCurrencies(null);
                  setNotice("");
                  setError("");
                }}
                disabled={loadingProfiles || profiles.length === 0}
              >
                {loadingProfiles && <option value="">Carregando perfis…</option>}
                {!loadingProfiles && profiles.length === 0 && <option value="">Nenhum perfil</option>}
                {profiles.map((profile) => (
                  <option value={profile.id} key={profile.id}>
                    {profile.name} — Nv. {profile.level}
                  </option>
                ))}
              </select>
            </label>
            <span className="chevron">⌄</span>
          </div>
        </header>

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
                    ? "Pesquise ofertas e gerencie suas vendas."
                    : "Reputação e acesso aos comerciantes do seu perfil."}
              </p>
            </div>
            <div className={`connection-badge ${status?.connectorInstalled ? "connected" : "readonly"}`}>
              <span className="status-dot" />
              {status?.connectorInstalled ? "CONECTOR ONLINE" : "LEITURA LOCAL"}
            </div>
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
                        onClick={() => {
                          setProfileId(profile.id);
                          setScreen("stash");
                        }}
                      >
                        {profile.id === profileId ? "CONTINUAR COM ESTE PERFIL" : "ABRIR PERFIL"}
                        <span>↗</span>
                      </button>
                    </article>
                  ))}
                </div>
              )}
              <div className="character-disclaimer">
                <span className="status-dot" /> PERFIS E DADOS DE JOGO SÃO LIDOS LOCALMENTE · NENHUM ARQUIVO É ALTERADO
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
                <span>ALTERAÇÕES NO JOGO NÃO SÃO ESCRITAS PELA WEB</span>
              </div>
            </section>
          )}

          {screen === "flea" && (
            <section className="market-layout">
              <aside className="panel market-filters">
                <div className="panel-title">
                  <span className="panel-mark">02</span>
                  <div><strong>BUSCAR OFERTAS</strong><small>FILTROS DO MERCADO</small></div>
                </div>
                <label className="field-label" htmlFor="flea-query">NOME DO ITEM</label>
                <div className="search-box full">
                  <span>⌕</span><input id="flea-query" placeholder="Ex.: Salewa, AK-74..." value={search} onChange={(event) => setSearch(event.target.value)} />
                </div>
                <label className="field-label" htmlFor="sort-price">ORDENAR POR</label>
                <select id="sort-price" className="select-field" defaultValue="lowest">
                  <option value="lowest">Menor preço</option><option value="highest">Maior preço</option><option value="expiry">Expiração</option>
                </select>
                <label className="check-row"><input type="checkbox" defaultChecked /> Excluir trocas</label>
                <label className="check-row"><input type="checkbox" /> Apenas itens encontrados em raid</label>
                <button className="primary-button" onClick={() => void requestMarketAction("search")}>BUSCAR NO FLEA <span>↗</span></button>
                <div className="connector-note">
                  <span className="note-icon">!</span>
                  <p>A busca de ofertas requer o conector do servidor SPT. Nenhuma oferta fictícia é exibida.</p>
                </div>
              </aside>
              <div className="panel offers-panel">
                <div className="offers-toolbar">
                  <div className="segmented">
                    <button className="selected">BUSCAR</button>
                    <button onClick={() => void requestMarketAction("my-offers")}>MINHAS OFERTAS</button>
                  </div>
                  <button className="text-button" onClick={() => void requestMarketAction("list")}>＋ ANUNCIAR ITEM</button>
                </div>
                <div className="offers-table-head"><span>OFERTA</span><span>VENDEDOR</span><span>PREÇO</span><span>STATUS</span><span /></div>
                <div className="market-empty">
                  <div className="empty-orbit">⌕</div>
                  <strong>MERCADO AGUARDANDO CONECTOR</strong>
                  <p>As ofertas reais são fornecidas pelo servidor SPT. Instale o conector local para habilitar busca, compra e anúncios.</p>
                  <span className="protocol-tag">SPT 4.1.6 · API LOCAL</span>
                </div>
                <div className="panel-footer"><span>BUSCA E TRANSAÇÕES DESABILITADAS</span><span>SEM CONECTOR INSTALADO</span></div>
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

        <footer className="statusbar">
          <span><b>SPT MARKET</b> <i>◆</i> WEB CLIENT</span>
          <span className="statusbar-center"><i className="status-dot" /> CONEXÃO LOCAL · SOMENTE LEITURA</span>
          <span>BUILD 0.1.0</span>
        </footer>
      </section>
    </main>
  );
}
