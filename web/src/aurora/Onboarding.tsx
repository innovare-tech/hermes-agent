import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Icon } from "./Icon";
import { agent } from "./agent";
import type { Gateway, Settings } from "./agent/types";
import { Orbit } from "./screens/Chat";
import { applySetting } from "./screens/Settings";
import { setState, toast, useStore } from "./store";

const STEP_TITLE = ["", "Passo 1 · Modelo", "Passo 2 · Ambiente", "Passo 3 · Mensageiros"];

/** Assistente de setup em 5 passos (overlay). Cada escolha já é aplicada no agente. */
export function Onboarding() {
  const step = useStore((s) => s.onboarding);
  const navigate = useNavigate();
  const [s, setS] = useState<Settings | null>(null);
  const [gws, setGws] = useState<Gateway[]>([]);

  useEffect(() => {
    if (step < 0) return;
    agent.settings().then(setS, () => toast("Não consegui carregar as configurações"));
    agent.gateways().then((g) => setGws(g.items), () => {});
  }, [step < 0]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step < 0) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setState({ onboarding: -1 });
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  if (step < 0) return null;
  const prov = s?.providers.find((p) => p.id === s.provider);
  const on = gws.filter((g) => g.enabled).map((g) => g.name);
  const next = () => {
    if (step === 4) {
      setState({ onboarding: -1 });
      navigate("/chat");
      toast("Hermes está pronto");
    } else setState({ onboarding: step + 1 });
  };
  const toggleGw = async (g: Gateway) => {
    try {
      await agent.toggleGateway(g);
      setGws(gws.map((x) => (x.id === g.id ? { ...x, enabled: !x.enabled } : x)));
    } catch {
      toast("Não consegui alterar " + g.name);
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Assistente de setup" style={{ position: "absolute", inset: 0, zIndex: 40, background: "var(--bg)", display: "flex", flexDirection: "column", animation: "hin .35s ease both" }}>
      <div className="au-abs" style={{ background: "var(--atmo)" }} />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, padding: "22px 28px" }}>
        <div className="au-logo" style={{ animation: "none", boxShadow: "none" }} aria-hidden="true">☤</div>
        <span className="au-display" style={{ fontSize: 19 }}>Hermes</span>
        <div aria-label={`Passo ${step + 1} de 5`} style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} style={{ height: 6, width: i === step ? 26 : 6, borderRadius: 6, background: i <= step ? "var(--acc)" : "var(--line2)", transition: "all .4s cubic-bezier(.2,.7,.2,1)" }} />
          ))}
        </div>
        <button className="au-outline" onClick={() => setState({ onboarding: -1 })} style={{ marginLeft: 18, padding: "7px 12px", fontSize: 12.5, color: "var(--fg2)" }}>
          Pular
        </button>
      </div>

      <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, overflow: "auto" }}>
        <div key={step} style={{ width: "100%", maxWidth: 620, display: "flex", flexDirection: "column", gap: 30 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18, animation: "hblurin .7s cubic-bezier(.2,.7,.2,1) both" }}>
            {step === 0 && (
              <>
                <Orbit />
                <span className="au-step-label">Bem-vindo</span>
                <h1 className="au-display" style={{ margin: 0, fontSize: "calc(var(--h1) * 1.25)", lineHeight: 1.02, textWrap: "balance" }}>O agente que cresce com você.</h1>
                <p style={{ margin: 0, fontSize: 16, lineHeight: 1.6, color: "var(--fg2)", textWrap: "pretty" }}>Quatro passos: escolher um modelo, decidir onde ele roda, conectar onde você conversa — e pronto. Dá para mudar tudo depois.</p>
              </>
            )}
            {step >= 1 && step <= 3 && (
              <>
                <span className="au-step-label">{STEP_TITLE[step]}</span>
                <h2 className="au-h1">{["", "Quem vai pensar?", "Onde ele trabalha?", "Onde vocês vão conversar?"][step]}</h2>
              </>
            )}
            {step === 1 && s && (
              <div role="radiogroup" aria-label="Provedor" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.providers.map((p) => (
                  <button key={p.id} role="radio" aria-checked={p.id === s.provider} className="au-choice" style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: "14px 16px" }} onClick={() => p.id !== s.provider && applySetting(s, setS, { provider: p.id, model: p.models[0] })}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 14, fontWeight: 500 }}>{p.name}</span>
                      <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{p.description}</span>
                    </span>
                    <Icon name={p.id === s.provider ? "circle-check" : "circle"} size={16} color="var(--acc)" className="au-ml-auto" />
                  </button>
                ))}
              </div>
            )}
            {step === 2 && s && (
              <div role="radiogroup" aria-label="Ambiente" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
                {s.backends.map((b) => (
                  <button key={b.id} role="radio" aria-checked={b.id === s.backend} className="au-choice" style={{ gap: 4 }} onClick={() => b.id !== s.backend && applySetting(s, setS, { backend: b.id })}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</span>
                    <span style={{ fontSize: 12, color: "var(--fg2)" }}>{b.description}</span>
                  </button>
                ))}
              </div>
            )}
            {step === 3 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 8 }}>
                {gws.map((g) => (
                  <button key={g.id} role="checkbox" aria-checked={g.enabled} className="au-choice" style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: "12px 14px" }} onClick={() => toggleGw(g)}>
                    <span className="au-display" style={{ width: 30, height: 30, borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 14, letterSpacing: 0 }}>{g.mono}</span>
                    <span style={{ fontSize: 13.5, fontWeight: 500 }}>{g.name}</span>
                    <Icon name={g.enabled ? "circle-check" : "circle"} size={15} color="var(--acc)" className="au-ml-auto" />
                  </button>
                ))}
              </div>
            )}
            {step === 4 && (
              <>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center", animation: "hin .6s cubic-bezier(.3,1.5,.5,1) both" }}>
                  <Icon name="check" size={26} />
                </div>
                <h2 className="au-display" style={{ margin: 0, fontSize: "calc(var(--h1) * 1.1)", lineHeight: 1.05 }}>Tudo pronto.</h2>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: "var(--fg2)" }}>
                  {prov?.name} com {s?.model}, rodando em {s?.backends.find((b) => b.id === s.backend)?.name}. Conectado a {on.length ? on.join(", ") : "nenhum mensageiro"}. Mande a primeira mensagem — eu aprendo a partir dela.
                </p>
              </>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {step > 0 && step < 4 && (
              <button className="au-outline" onClick={() => setState({ onboarding: step - 1 })} style={{ padding: "12px 18px", fontSize: 14 }}>
                Voltar
              </button>
            )}
            <button className="au-primary au-ob-next" onClick={next}>
              {step === 0 ? "Começar" : step === 4 ? "Abrir o Hermes" : "Continuar"}
              <Icon name="arrow-right" size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

