import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import type { AutonomyMode } from "./adapter";
import { Icon } from "./Icon";
import { agent } from "./agent";
import type { Gateway, ProviderOption, Settings } from "./agent/types";
import { AutonomySegment } from "./ops/AutonomySegment";
import { Orbit } from "./screens/Chat";
import { GatewaySetup } from "./screens/Gateways";
import { MODES, setDefaultMode, setState, toast, useStore } from "./store";

const STEPS = ["Bem-vindo", "Modelo", "Ambiente", "Canais", "Segurança", "Pronto"];
const LAST = STEPS.length - 1;
/** Provedores com chave de API mais comuns primeiro; o resto fica em "mais provedores". */
const POPULAR = ["openrouter", "anthropic", "openai-api", "gemini", "deepseek", "xai"];
const MAIN_CHANNELS = ["telegram", "whatsapp", "discord", "slack", "email", "signal"];
const MODE_HELP = ["Só lê e organiza na Caixa de entrada. Não responde ninguém.", "Escreve a resposta e espera o seu ok em Aprovações. Recomendado.", "Responde sozinho e registra tudo na Atividade."];
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

export const ONBOARDED_KEY = "hermes.onboarded";
const markDone = () => {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* navegação privada: o assistente só volta a abrir sozinho se não houver modelo */
  }
};

/** Passo Modelo: escolher provedor (colando a chave quando falta) e o modelo. */
function ModelStep({ catalog, pick, setPick, onCatalog, current }: { catalog: ProviderOption[]; pick: { provider: string; model: string }; setPick: (p: { provider: string; model: string }) => void; onCatalog: (c: ProviderOption[]) => void; current: { provider: string; model: string } }) {
  const [more, setMore] = useState(false);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    agent.apiKeys().then((ks) => setUrls(Object.fromEntries(ks.filter((k) => k.url).map((k) => [k.key, k.url!]))), () => {});
  }, []);

  const connected = catalog.filter((p) => p.connected);
  const withKey = catalog.filter((p) => !p.connected && p.keyEnv).sort((a, b) => (POPULAR.indexOf(a.id) + 1 || 99) - (POPULAR.indexOf(b.id) + 1 || 99));
  const shownKey = more ? withKey : withKey.filter((p) => POPULAR.includes(p.id));
  const terminalOnly = catalog.filter((p) => !p.connected && !p.keyEnv);
  const sel = catalog.find((p) => p.id === pick.provider);
  const models = (sel?.models ?? []).filter((m) => !q || m.toLowerCase().includes(q.toLowerCase()));

  const saveKey = async () => {
    if (!sel?.keyEnv || !key.trim()) return;
    setSaving(true);
    try {
      await agent.setApiKey(sel.keyEnv, key.trim());
      const fresh = await agent.providerCatalog(true);
      onCatalog(fresh);
      const now = fresh.find((p) => p.id === sel.id);
      if (now?.connected) {
        setKey("");
        setPick({ provider: sel.id, model: now.models[0] ?? "" });
        toast(`${sel.name} conectado`);
      } else toast("Chave salva, mas o provedor ainda não respondeu — confira a chave");
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar a chave"));
    }
    setSaving(false);
  };

  const row = (p: ProviderOption) => (
    <button key={p.id} role="radio" aria-checked={p.id === pick.provider} className="au-choice" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: "12px 16px" }} onClick={() => setPick({ provider: p.id, model: !p.connected ? "" : p.id === pick.provider ? pick.model : p.id === current.provider && p.models.includes(current.model) ? current.model : (p.models[0] ?? "") })}>
      <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
        <span style={{ fontSize: 12, color: p.connected ? "var(--ok)" : "var(--fg2)" }}>{p.connected ? "Conectado" : "Precisa de chave de API"}</span>
      </span>
      <Icon name={p.id === pick.provider ? "circle-check" : "circle"} size={16} color="var(--acc)" className="au-ml-auto" />
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div role="radiogroup" aria-label="Provedor" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {connected.map(row)}
        {shownKey.map(row)}
      </div>
      {withKey.length > shownKey.length && (
        <button className="au-chip" onClick={() => setMore(true)} style={{ alignSelf: "flex-start", cursor: "pointer", background: "transparent" }}>
          Mais {withKey.length - shownKey.length} provedores com chave de API
        </button>
      )}
      {more && terminalOnly.length > 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--fg3)", lineHeight: 1.5 }}>
          {terminalOnly.map((p) => p.name).join(", ")} usam login próprio: configure no servidor com <code>hermes model</code>.
        </p>
      )}

      {sel && !sel.connected && sel.keyEnv && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveKey();
          }}
          className="au-card"
          style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}
        >
          <label className="au-field">
            <span className="au-label">Chave de API · {sel.name}</span>
            <input type="password" autoComplete="off" autoFocus value={key} onChange={(e) => setKey(e.target.value)} placeholder="cole a chave aqui" />
          </label>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="submit" className="au-primary" disabled={saving || !key.trim()}>
              {saving ? "Conectando…" : "Salvar chave"}
            </button>
            {urls[sel.keyEnv] && (
              <a href={urls[sel.keyEnv]} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--acc)" }}>
                Onde pegar a chave
              </a>
            )}
            <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Fica guardada só neste servidor e nunca aparece de volta na tela.</span>
          </div>
        </form>
      )}

      {sel?.connected && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="au-label">Modelo · {sel.name}</span>
          {sel.models.length > 10 && <input aria-label="Buscar modelo" className="au-inline" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar modelo" style={{ padding: "8px 12px", border: "1px solid var(--line2)", borderRadius: "var(--r2)", background: "var(--panel)" }} />}
          <div role="radiogroup" aria-label="Modelo" style={{ display: "flex", flexWrap: "wrap", gap: 6, maxHeight: 180, overflow: "auto" }}>
            {models.map((m) => (
              <button key={m} role="radio" aria-checked={m === pick.model} className="au-pill" aria-pressed={m === pick.model} onClick={() => setPick({ provider: sel.id, model: m })} style={{ fontFamily: "var(--fm)", fontSize: 11.5, padding: "7px 12px" }}>
                {m}
              </button>
            ))}
            {models.length === 0 && <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>{q ? "Nenhum modelo com esse nome." : "O provedor não listou modelos."}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/** Assistente de setup (overlay): modelo → ambiente → canais → segurança. Cada passo salva só no "Salvar e continuar". */
export function Onboarding() {
  const step = useStore((s) => s.onboarding);
  const storedDefault = useStore((s) => s.defaultMode);
  const navigate = useNavigate();
  const [s, setS] = useState<Settings | null>(null);
  const [catalog, setCatalog] = useState<ProviderOption[] | null>(null);
  const [pick, setPick] = useState({ provider: "", model: "" });
  const [backend, setBackend] = useState("local");
  const [gws, setGws] = useState<Gateway[]>([]);
  const [openGw, setOpenGw] = useState<string | null>(null);
  const [mode, setMode] = useState<AutonomyMode>(storedDefault);
  const [busy, setBusy] = useState(false);

  const loadGateways = () => agent.gateways().then((g) => setGws(g.items), () => {});
  useEffect(() => {
    if (step < 0) return;
    // Cada abertura parte do que está salvo: "Fechar" descarta escolhas não salvas.
    setPick({ provider: "", model: "" });
    setOpenGw(null);
    agent.settings().then((x) => {
      setS(x);
      setBackend(x.backend);
    }, () => toast("Não consegui carregar as configurações"));
    agent.providerCatalog().then((c) => {
      setCatalog(c);
      const cur = c.find((p) => p.current && p.connected) ?? c.find((p) => p.connected);
      if (cur) setPick((p) => p.provider ? p : { provider: cur.id, model: "" });
    }, () => setCatalog([]));
    loadGateways();
    setMode(storedDefault);
  }, [step < 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // Modelo atual pré-selecionado quando as configurações chegam.
  useEffect(() => {
    if (s?.model && catalog) setPick((p) => (p.model ? p : { provider: p.provider || s.provider, model: s.model }));
  }, [s, catalog]);

  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);  

  if (step < 0) return null;
  const close = () => {
    markDone();
    setState({ onboarding: -1 });
  };
  const sel = catalog?.find((p) => p.id === pick.provider);
  const connectedGws = gws.filter((g) => g.configured);
  const canNext = step !== 1 || !!(sel?.connected && pick.model);

  const next = async () => {
    setBusy(true);
    try {
      if (step === 1 && s && (pick.provider !== s.provider || pick.model !== s.model)) await agent.saveSettings({ provider: pick.provider, model: pick.model });
      if (step === 2 && s && backend !== s.backend) await agent.saveSettings({ backend });
      if (step === 4 && mode !== storedDefault) await setDefaultMode(mode);
      if (step === LAST) {
        close();
        navigate("/chat");
      } else setState({ onboarding: step + 1 });
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar"));
    }
    setBusy(false);
  };

  const backendName = s?.backends.find((b) => b.id === backend)?.name ?? backend;

  return (
    <div role="dialog" aria-modal="true" aria-label="Assistente de configuração" style={{ position: "absolute", inset: 0, zIndex: 40, background: "var(--bg)", display: "flex", flexDirection: "column", animation: "hin .35s ease both" }}>
      <div className="au-abs" style={{ background: "var(--atmo)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "22px 28px" }}>
        <div className="au-logo" style={{ animation: "none", boxShadow: "none" }} aria-hidden="true">☤</div>
        <span className="au-display" style={{ fontSize: 19 }}>Hermes</span>
        <div aria-label={`Passo ${step + 1} de ${STEPS.length}`} style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {STEPS.map((t, i) => (
            <span key={t} title={t} style={{ height: 6, width: i === step ? 26 : 6, borderRadius: 6, background: i <= step ? "var(--acc)" : "var(--line2)", transition: "all .4s cubic-bezier(.2,.7,.2,1)" }} />
          ))}
        </div>
        {step < LAST && (
          <button className="au-outline" onClick={close} style={{ marginLeft: 18, padding: "7px 12px", fontSize: 12.5, color: "var(--fg2)" }}>
            Fechar
          </button>
        )}
      </div>

      {/* Rolagem com centralização segura: conteúdo alto nunca fica cortado em cima. */}
      <div style={{ position: "relative", flex: 1, overflow: "auto", padding: 24, display: "flex" }}>
        <div key={step} style={{ width: "100%", maxWidth: 620, margin: "auto", display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, animation: "hblurin .7s cubic-bezier(.2,.7,.2,1) both" }}>
            {step === 0 && (
              <>
                <Orbit />
                <span className="au-step-label">Bem-vindo</span>
                <h1 className="au-display" style={{ margin: 0, fontSize: "calc(var(--h1) * 1.25)", lineHeight: 1.02, textWrap: "balance" }}>O agente que cresce com você.</h1>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--fg2)", textWrap: "pretty" }}>Quatro passos: escolher o modelo, decidir onde ele trabalha, conectar onde você conversa e definir o quanto ele pode agir sozinho. Dá para mudar tudo depois.</p>
              </>
            )}
            {step >= 1 && step < LAST && (
              <>
                <span className="au-step-label">
                  Passo {step} · {STEPS[step]}
                </span>
                <h2 className="au-h1">{["", "Quem vai pensar?", "Onde ele trabalha?", "Onde vocês vão conversar?", "Quanto ele pode agir sozinho?"][step]}</h2>
              </>
            )}

            {step === 1 && (catalog ? <ModelStep catalog={catalog} pick={pick} setPick={setPick} onCatalog={setCatalog} current={{ provider: s?.provider ?? "", model: s?.model ?? "" }} /> : <span style={{ color: "var(--fg3)" }}>Carregando provedores…</span>)}

            {step === 2 && s && (
              <>
                <p style={{ margin: 0, fontSize: 14, color: "var(--fg2)", lineHeight: 1.55 }}>Onde os comandos que o Hermes executa (terminal, arquivos) rodam. Se não souber, deixe “Local”.</p>
                <div role="radiogroup" aria-label="Ambiente" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
                  {s.backends.map((b) => (
                    <button key={b.id} role="radio" aria-checked={b.id === backend} className="au-choice" style={{ gap: 4 }} onClick={() => setBackend(b.id)}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</span>
                      <span style={{ fontSize: 12, color: "var(--fg2)" }}>{b.description}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <p style={{ margin: 0, fontSize: 14, color: "var(--fg2)", lineHeight: 1.55 }}>Opcional. Escolha um canal, cole as credenciais e teste. Os outros ficam em Gateways.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {gws
                    .filter((g) => MAIN_CHANNELS.includes(g.id))
                    .sort((a, b) => MAIN_CHANNELS.indexOf(a.id) - MAIN_CHANNELS.indexOf(b.id))
                    .map((g) => (
                      <div key={g.id} className="au-card" style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <button className="au-ghost" aria-expanded={openGw === g.id} onClick={() => setOpenGw(openGw === g.id ? null : g.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: 0, width: "100%" }}>
                          <span className="au-display" style={{ width: 30, height: 30, borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 14, letterSpacing: 0 }}>{g.mono}</span>
                          <span style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)" }}>{g.name}</span>
                          {g.configured && <span style={{ fontSize: 12, color: "var(--ok)" }}>configurado</span>}
                          <Icon name={openGw === g.id ? "chevron-up" : "chevron-down"} size={14} className="au-ml-auto" />
                        </button>
                        {openGw === g.id && (
                          <GatewaySetup
                            g={g}
                            onSaved={() => {
                              toast(`${g.name} salvo`);
                              loadGateways();
                            }}
                          />
                        )}
                      </div>
                    ))}
                </div>
              </>
            )}

            {step === 4 && (
              <>
                <p style={{ margin: 0, fontSize: 14, color: "var(--fg2)", lineHeight: 1.55 }}>Vale para cada conversa ou grupo novo que falar com o Hermes. Dá para ajustar canal por canal em Aprovações.</p>
                <AutonomySegment label="Modo dos canais novos" mode={mode} onPick={setMode} />
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>
                  <strong>{MODES[mode]}:</strong> {MODE_HELP[mode]}
                </p>
              </>
            )}

            {step === LAST && (
              <>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center", animation: "hin .6s cubic-bezier(.3,1.5,.5,1) both" }}>
                  <Icon name="check" size={26} />
                </div>
                <h2 className="au-display" style={{ margin: 0, fontSize: "calc(var(--h1) * 1.1)", lineHeight: 1.05 }}>Tudo pronto.</h2>
                <ul style={{ margin: 0, paddingLeft: 20, fontSize: 15, lineHeight: 1.8, color: "var(--fg2)" }}>
                  <li>
                    Modelo: <strong style={{ color: "var(--fg)" }}>{sel?.name ?? "—"}</strong> · {pick.model || "—"}
                  </li>
                  <li>Comandos rodam em: {backendName}</li>
                  <li>{connectedGws.length ? `Canais conectados: ${connectedGws.map((g) => g.name).join(", ")}` : "Nenhum canal conectado ainda — dá para conectar depois em Gateways."}</li>
                  <li>Canais novos começam em: {MODES[mode]}</li>
                </ul>
              </>
            )}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {step > 0 && step < LAST && (
              <button className="au-outline" onClick={() => setState({ onboarding: step - 1 })} style={{ padding: "12px 18px", fontSize: 14 }}>
                Voltar
              </button>
            )}
            <button className="au-primary au-ob-next" onClick={next} disabled={busy || !canNext}>
              {step === 0 ? "Começar" : step === LAST ? "Abrir a Conversa" : step === 3 && connectedGws.length === 0 ? "Pular por agora" : "Salvar e continuar"}
              <Icon name="arrow-right" size={15} />
            </button>
            {step === 1 && !canNext && <span style={{ fontSize: 12.5, color: "var(--fg3)" }}>Escolha um provedor conectado e um modelo.</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
