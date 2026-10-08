import { useState } from "react";
import type { Playbook, PlaybookNode } from "../adapter";
import { spot } from "../Chrome";
import { humanizeSchedule, toSchedule } from "../agent/cron";
import { Icon } from "../Icon";
import { runPlaybook, savePlaybook, useStore } from "../store";

const PRESETS: { label: string; value: string }[] = [
  { label: "Só manual", value: "" },
  { label: "Dias úteis 9h", value: "dias úteis às 9h" },
  { label: "Todo dia 18h", value: "todo dia às 18h" },
  { label: "Toda segunda 9h", value: "toda segunda às 9h" },
  { label: "A cada hora", value: "a cada 1 hora" },
];

/** Configuração do playbook: nome, quando roda (cron do Hermes), para onde vai o resultado e os passos. */
/** Passo novo entra antes do passo final ("Registrar na Atividade"), não depois dele. */
export function beforeEnd(nodes: PlaybookNode[], n: PlaybookNode): PlaybookNode[] {
  const end = nodes.findIndex((x) => x.kind === "end");
  return end < 0 ? [...nodes, n] : [...nodes.slice(0, end), n, ...nodes.slice(end)];
}

const KINDS: [Playbook["triggerKind"], string][] = [
  ["manual", "Manual"],
  ["schedule", "Horário"],
  ["keyword", "Palavra-chave"],
];

export function PlaybookSettings({ p }: { p: Playbook }) {
  const channels = useStore((s) => s.autonomy);
  const businesses = useStore((s) => s.businesses);
  // O campo mostra o horário em português; ao salvar vira o formato do agendador.
  const [d, setD] = useState({ ...p, schedule: humanizeSchedule(p.schedule) });
  const set = (patch: Partial<Playbook>) => setD({ ...d, ...patch });
  const setNode = (i: number, patch: Partial<PlaybookNode>) => set({ nodes: d.nodes.map((n, j) => (j === i ? { ...n, ...patch } : n)) });
  const dirty = JSON.stringify(d) !== JSON.stringify({ ...p, schedule: humanizeSchedule(p.schedule) });

  const save = () => {
    const { id, name, business, trigger, enabled, nodes, schedule, deliver, triggerKind, keywords, channelId } = d;
    const first = nodes[0]?.kind === "trigger" ? [{ ...nodes[0], text: trigger }, ...nodes.slice(1)] : nodes;
    return savePlaybook({ id, name: name.trim() || p.name, business, trigger, enabled, nodes: first, schedule: triggerKind === "schedule" ? toSchedule(schedule) : "", deliver, triggerKind, keywords, channelId }, "Playbook salvo");
  };

  return (
    <form
      className="au-card"
      onMouseMove={spot}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      style={{ padding: 22, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span className="au-display" style={{ fontSize: 20 }}>
          Configuração
        </span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
          {!p.enabled ? "desligado" : p.triggerKind === "keyword" ? "dispara por palavra-chave" : p.schedule ? (p.nextRun ? `próxima ${p.nextRun}` : "agendado") : "só manual"} · {p.runs} {p.runs === 1 ? "execução" : "execuções"}
        </span>
      </div>
      {p.lastError && (
        <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--err)", lineHeight: 1.5 }}>
          Última execução falhou: {p.lastError}
        </p>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        <label className="au-field">
          <span className="au-label">Nome</span>
          <input value={d.name} onChange={(e) => set({ name: e.target.value })} />
        </label>
        <label className="au-field">
          <span className="au-label">Negócio</span>
          <select value={d.business} onChange={(e) => set({ business: e.target.value })}>
            <option value="">sem negócio</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="au-label">O que dispara</span>
        <div role="radiogroup" aria-label="Tipo de gatilho" style={{ display: "flex", gap: 3, padding: 3, borderRadius: "var(--r2)", background: "var(--panel2)", alignSelf: "flex-start" }}>
          {KINDS.map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={d.triggerKind === k} className="au-seg au-seg-lg" onClick={() => set({ triggerKind: k })}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {d.triggerKind === "manual" && <p style={{ margin: 0, fontSize: 12.5, color: "var(--fg3)" }}>Roda só quando você clicar em “Executar agora”.</p>}

      {d.triggerKind === "keyword" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
          <label className="au-field">
            <span className="au-label">Palavras-chave</span>
            <input value={d.keywords} onChange={(e) => set({ keywords: e.target.value })} placeholder="ex.: orçamento, cotação, preço" />
            <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Separe por vírgula. Maiúsculas e acentos não importam.</span>
          </label>
          <label className="au-field">
            <span className="au-label">De qual canal</span>
            <select value={d.channelId} onChange={(e) => set({ channelId: e.target.value })}>
              <option value="">Qualquer canal</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.platform}
                </option>
              ))}
            </select>
            <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Respeita a autonomia: em Observar não dispara; em Rascunhar o resultado só fica registrado.</span>
          </label>
        </div>
      )}

      {d.triggerKind === "schedule" && (
      <>
      <label className="au-field">
        <span className="au-label">Quando rodar</span>
        <input value={d.schedule} onChange={(e) => set({ schedule: e.target.value })} placeholder="ex.: dias úteis às 9h, toda sexta às 18h, a cada 2 horas" spellCheck={false} />
      </label>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: -6 }}>
        {PRESETS.filter((x) => x.value).map((x) => (
          <button key={x.label} type="button" className="au-chip" aria-pressed={d.schedule === x.value} onClick={() => set({ schedule: x.value })} style={{ cursor: "pointer", background: d.schedule === x.value ? "var(--accSoft)" : "transparent" }}>
            {x.label}
          </button>
        ))}
      </div>
      <p style={{ margin: "-4px 0 0", fontSize: 11.5, color: "var(--fg3)", lineHeight: 1.5 }}>
        Escreva como fala: “dias úteis às 9h”, “toda sexta às 18h”, “todo dia 1 às 10h”, “a cada 2 horas”. O Hermes executa no horário enquanto o gateway estiver ligado.
      </p>
      </>
      )}

      <label className="au-field">
        <span className="au-label">Enviar o resultado para</span>
        <select value={d.deliver} onChange={(e) => set({ deliver: e.target.value })}>
          <option value="local">Só registrar no Hermes</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.platform}
            </option>
          ))}
          {d.deliver !== "local" && !channels.some((c) => c.id === d.deliver) && <option value={d.deliver}>{d.deliver}</option>}
        </select>
      </label>

      <label className="au-field">
        <span className="au-label">Gatilho</span>
        <input value={d.trigger} onChange={(e) => set({ trigger: e.target.value })} />
      </label>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="au-label">Passos</span>
        {d.nodes.map((n, i) =>
          n.kind === "trigger" ? null : (
            <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", width: 18 }}>{i}</span>
              <div className="au-field" style={{ flex: 1 }}>
                <input aria-label={`Passo ${i}`} value={n.text} onChange={(e) => setNode(i, { text: e.target.value })} placeholder={n.kind === "cond" ? "se… (ex.: o valor passa de R$ 500?)" : n.kind === "end" ? "fim" : "faça… (ex.: liste os boletos vencendo)"} />
              </div>
              {n.kind === "cond" && (
                <div className="au-field" style={{ flex: 1 }}>
                  <input aria-label={`Se não, no passo ${i}`} value={n.elseText ?? ""} onChange={(e) => setNode(i, { elseText: e.target.value })} placeholder="se não…" />
                </div>
              )}
              <button type="button" className="au-mini danger" aria-label={`Remover passo ${i}`} onClick={() => set({ nodes: d.nodes.filter((_, j) => j !== i) })}>
                <Icon name="trash-2" size={12} />
              </button>
            </div>
          ),
        )}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" className="au-outline" onClick={() => set({ nodes: beforeEnd(d.nodes, { kind: "action", text: "" }) })}>
            + Ação
          </button>
          <button type="button" className="au-outline" onClick={() => set({ nodes: beforeEnd(d.nodes, { kind: "cond", text: "", elseText: "" }) })}>
            + Condição
          </button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="submit" className="au-primary" style={{ opacity: dirty ? 1 : 0.5 }}>
          Salvar
        </button>
        <button type="button" className="au-outline" onClick={() => runPlaybook(p)} title={dirty ? "Salve antes para executar a versão nova" : undefined}>
          <Icon name="play" size={13} /> Executar agora
        </button>
      </div>
    </form>
  );
}
