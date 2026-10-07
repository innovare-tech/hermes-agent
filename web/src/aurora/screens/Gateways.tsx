import { useState } from "react";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { Gateway, GatewayField } from "../agent/types";
import { ask, toast } from "../store";
import { AgentHeader } from "./Sessions";

const STATUS_COLOR: Record<Gateway["status"], string> = { conectado: "var(--ok)", pareando: "var(--warn)", desligado: "var(--fg3)", erro: "var(--err)" };
const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** O que gravar: segredo só quando digitado (vazio = manter); demais campos só se mudaram. Listas: uma por linha → CSV. */
export function envChanges(fields: GatewayField[], vals: Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const f of fields) {
    const v = (vals[f.key] ?? "").trim();
    const out = f.list ? v.split(/[\n,]/).map((x) => x.trim()).filter(Boolean).join(",") : v;
    if (f.secret ? out : out !== f.value.trim()) env[f.key] = out;
  }
  return env;
}

/** Credenciais de um canal: só os campos preenchidos são gravados; segredo salvo nunca volta para a tela. */
export function GatewaySetup({ g, onSaved }: { g: Gateway; onSaved: (restart: boolean) => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(g.fields.map((f) => [f.key, f.secret ? "" : f.list ? f.value.split(",").filter(Boolean).join("\n") : f.value])));
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState("");
  const [test, setTest] = useState<{ ok: boolean; message: string } | null>(null);
  const fields = g.fields.filter((f) => advanced || !f.advanced);

  const save = async () => {
    setBusy("save");
    try {
      onSaved((await agent.saveGateway(g.id, envChanges(g.fields, vals))).restart);
    } catch (e) {
      toast(errMsg(e, "Não consegui salvar"));
    }
    setBusy("");
  };
  const runTest = async () => {
    setBusy("test");
    try {
      setTest(await agent.testGateway(g.id));
    } catch (e) {
      setTest({ ok: false, message: errMsg(e, "O teste falhou") });
    }
    setBusy("");
  };
  const clear = async () => {
    if (!(await ask({ title: `Apagar as credenciais de ${g.name}?`, body: "O canal para de funcionar até você colar as credenciais de novo.", confirm: "Apagar", danger: true }))) return;
    try {
      await agent.saveGateway(g.id, {}, g.fields.filter((f) => f.isSet).map((f) => f.key));
      onSaved(true);
    } catch (e) {
      toast(errMsg(e, "Não consegui apagar"));
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 12, borderTop: "1px solid var(--line)" }}
    >
      {g.description && <p style={{ margin: 0, fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>{g.description}</p>}
      {fields.map((f) => (
        <label key={f.key} className="au-field">
          <span className="au-label" style={{ display: "flex", gap: 6 }}>
            {f.label}
            {f.isSet && <span style={{ color: "var(--ok)" }}>· salvo</span>}
          </span>
          {f.list ? (
            <textarea rows={2} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder="um por linha" spellCheck={false} />
          ) : (
            <input type={f.secret ? "password" : "text"} autoComplete="off" spellCheck={false} value={vals[f.key]} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} placeholder={f.secret && f.isSet ? "•••••• salvo — deixe vazio para manter" : f.key} />
          )}
          {(f.help || f.url) && (
            <span style={{ fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.45 }}>
              {f.help}{" "}
              {f.url && (
                <a href={f.url} target="_blank" rel="noreferrer" style={{ color: "var(--acc)" }}>
                  onde pegar
                </a>
              )}
            </span>
          )}
        </label>
      ))}
      {g.fields.some((f) => f.advanced) && (
        <button type="button" className="au-chip" onClick={() => setAdvanced(!advanced)} style={{ alignSelf: "flex-start", cursor: "pointer", background: "transparent" }}>
          {advanced ? "Esconder avançado" : "Mostrar avançado"}
        </button>
      )}
      {test && (
        <p role="status" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.5, color: test.ok ? "var(--ok)" : "var(--err)" }}>
          {test.ok ? "✓ " : "✕ "}
          {test.message}
        </p>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button type="submit" className="au-primary" disabled={!!busy}>
          {busy === "save" ? "Salvando…" : "Salvar e ligar"}
        </button>
        <button type="button" className="au-outline" disabled={!!busy || !g.configured} onClick={runTest} title={g.configured ? undefined : "Salve as credenciais primeiro"}>
          {busy === "test" ? "Testando…" : "Testar conexão"}
        </button>
        {g.fields.some((f) => f.isSet) && (
          <button type="button" className="au-outline danger" onClick={clear}>
            Apagar credenciais
          </button>
        )}
        {g.docsUrl && (
          <a href={g.docsUrl} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 12, color: "var(--acc)" }}>
            Guia de configuração
          </a>
        )}
      </div>
    </form>
  );
}

export function Gateways() {
  const [data, setData, reload] = useAgentData(() => agent.gateways(), []);
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");

  const toggle = async (g: Gateway) => {
    try {
      await agent.toggleGateway(g);
    } catch {
      return toast("Não consegui alterar " + g.name);
    }
    setData({ ...data!, items: data!.items.map((x) => (x.id === g.id ? { ...x, enabled: !x.enabled, status: x.enabled ? "desligado" : x.status === "desligado" ? "pareando" : x.status } : x)) });
    toast(`${g.name} ${g.enabled ? "desligado" : "ligado"}${data?.summary.running ? " — reinicie o gateway para aplicar" : ""}`);
  };
  const lifecycle = async (action: "start" | "stop" | "restart") => {
    if (action === "stop" && !(await ask({ title: "Parar o gateway?", body: "O Hermes deixa de receber e responder mensagens em todos os canais.", confirm: "Parar", danger: true }))) return;
    setBusy(action);
    try {
      await agent.gatewayAction(action);
      toast({ start: "Iniciando o gateway…", stop: "Parando o gateway…", restart: "Reiniciando o gateway…" }[action]);
      for (const ms of [2500, 6000]) setTimeout(reload, ms);
    } catch (e) {
      toast(errMsg(e, "O gateway recusou"));
    }
    setBusy("");
  };

  const needle = q.trim().toLowerCase();
  const items = (data?.items ?? []).filter((g) => !needle || g.name.toLowerCase().includes(needle) || g.id.includes(needle));
  const mine = items.filter((g) => g.configured || g.enabled);
  const rest = items.filter((g) => !(g.configured || g.enabled));
  const running = !!data?.summary.running;

  const card = (g: Gateway, i: number) => {
    const isOpen = open === g.id;
    return (
      <div key={g.id} className="au-card au-gw" onMouseMove={spot} style={{ animationDelay: i * 35 + "ms", gridColumn: isOpen ? "1 / -1" : undefined }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="au-display" style={{ width: 40, height: 40, borderRadius: "var(--r2)", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 18, letterSpacing: 0, flex: "none" }}>{g.mono}</span>
          <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
            <span style={{ fontSize: 14.5, fontWeight: 500 }}>{g.name}</span>
            <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.account}</span>
          </span>
          <button className="au-mini" aria-expanded={isOpen} aria-label={`${isOpen ? "Fechar" : "Configurar"} ${g.name}`} title="Configurar" onClick={() => setOpen(isOpen ? null : g.id)}>
            <Icon name={isOpen ? "chevron-up" : "settings-2"} size={14} />
          </button>
          {g.configured && (
            <button role="switch" aria-checked={g.enabled} aria-label={`${g.enabled ? "Desligar" : "Ligar"} ${g.name}`} className="au-switch lg" onClick={() => toggle(g)}>
              <span />
            </button>
          )}
        </div>
        {(g.configured || g.enabled) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11, color: STATUS_COLOR[g.status] }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: STATUS_COLOR[g.status] }} />
            {g.status}
            <span style={{ marginLeft: "auto", color: g.status === "erro" ? "var(--err)" : "var(--fg3)", textAlign: "right" }}>{g.stat}</span>
          </div>
        )}
        {isOpen && (
          <GatewaySetup
            g={g}
            onSaved={(restart) => {
              toast(restart && running ? `${g.name} salvo — reinicie o gateway para aplicar` : `${g.name} salvo`);
              reload();
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Gateways" sub="Conecte os canais onde o Hermes conversa. As credenciais ficam no .env desta máquina.">
          {data && (
            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 13px", borderRadius: 999, border: "1px solid var(--line2)", fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)" }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: running ? "var(--ok)" : "var(--err)", animation: running ? "hpulse 2s infinite" : "none" }} />
                {data.summary.label}
              </span>
              {running ? (
                <>
                  <button className="au-outline" disabled={!!busy} onClick={() => lifecycle("restart")}>
                    <Icon name="rotate-cw" size={13} /> Reiniciar
                  </button>
                  <button className="au-outline danger" disabled={!!busy} onClick={() => lifecycle("stop")}>
                    Parar
                  </button>
                </>
              ) : (
                <button className="au-primary" disabled={!!busy} onClick={() => lifecycle("start")}>
                  <Icon name="play" size={13} /> Iniciar gateway
                </button>
              )}
            </span>
          )}
        </AgentHeader>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel)", maxWidth: 360 }}>
          <Icon name="search" size={14} color="var(--fg3)" />
          <input aria-label="Buscar canal" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar canal (Telegram, WhatsApp…)" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13.5 }} />
        </div>

        {data && !running && (data.items ?? []).some((g) => g.enabled && g.configured) && (
          <div role="alert" className="au-card" style={{ padding: "14px 18px", display: "flex", alignItems: "center", gap: 12, borderColor: "var(--warn)" }}>
            <Icon name="octagon-pause" size={16} color="var(--warn)" />
            <span style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              Há canais ligados, mas o gateway está parado — o Hermes não recebe nem responde mensagens.
            </span>
            <button className="au-primary" disabled={!!busy} onClick={() => lifecycle("start")} style={{ marginLeft: "auto" }}>
              Iniciar gateway
            </button>
          </div>
        )}
        {mine.length > 0 && (
          <>
            <span className="au-label">Seus canais</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>{mine.map(card)}</div>
          </>
        )}
        {data && mine.length === 0 && !needle && <p style={{ margin: 0, fontSize: 13.5, color: "var(--fg2)" }}>Nenhum canal conectado ainda. Escolha um abaixo, cole as credenciais e clique em Salvar e ligar.</p>}
        {rest.length > 0 && (
          <>
            <span className="au-label">Disponíveis</span>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 14 }}>{rest.map(card)}</div>
          </>
        )}
      </div>
    </div>
  );
}
