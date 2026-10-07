import { useState } from "react";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import { toast } from "../store";
import { AgentHeader } from "./Sessions";

export function Cron() {
  const [jobs, setJobs] = useAgentData(() => agent.crons(), []);
  const [draft, setDraft] = useState("");
  const preview = draft.trim() ? agent.previewCron(draft) : null;

  const create = async () => {
    if (!draft.trim()) return;
    try {
      const job = await agent.createCron(draft);
      setJobs([job, ...(jobs ?? [])]);
      setDraft("");
      toast(`Agendamento criado · ${job.human}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui criar o agendamento");
    }
  };

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page au-page-agent">
        <AgentHeader title="Agendamentos" sub="Tarefas que rodam sozinhas pelo gateway. Descreva em linguagem natural." />
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "16px 18px", borderRadius: "var(--r)", border: "1px solid var(--line2)", background: "var(--panel)", backdropFilter: "var(--blur)", boxShadow: "var(--shadow)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="calendar-plus" size={16} color="var(--acc)" />
            <input aria-label="Novo agendamento" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && create()} placeholder="ex.: toda sexta às 18h, resuma meus commits da semana e mande no Discord" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 14.5 }} />
            <button className="au-primary" onClick={create} style={{ padding: "8px 14px", opacity: draft.trim() ? 1 : 0.45 }}>
              Agendar
            </button>
          </div>
          {draft.trim() && (
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", paddingTop: 10, borderTop: "1px solid var(--line)", fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)", animation: "hin .25s ease both" }}>
              {preview ? (
                <>
                  <span>
                    quando <b style={{ color: "var(--fg)", fontWeight: 500 }}>{preview.human}</b>
                  </span>
                  <span>
                    cron <b style={{ color: "var(--fg)", fontWeight: 500 }}>{preview.expr}</b>
                  </span>
                  <span>
                    entrega <b style={{ color: "var(--fg)", fontWeight: 500 }}>{preview.dest}</b>
                  </span>
                </>
              ) : (
                <span>diga quando: “toda sexta às 18h”, “dias úteis às 7h30”, “todo dia 1 às 10h”…</span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
          {jobs?.map((c, i) => (
            <div key={c.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 160px 120px 40px", gap: 18, alignItems: "center", padding: "17px 20px", borderBottom: "1px solid var(--line)", opacity: c.enabled ? 1 : 0.5, transition: "opacity .3s", animation: "hup .4s cubic-bezier(.2,.7,.2,1) both", animationDelay: i * 45 + "ms" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{c.title}</span>
                <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>
                  {c.human} · {c.expr}
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ fontFamily: "var(--fm)", fontSize: 9.5, color: "var(--fg3)", letterSpacing: ".1em" }}>PRÓXIMA</span>
                <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{c.next}</span>
              </div>
              <span style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--fg2)" }}>
                <Icon name={c.destIcon} size={13} />
                {c.dest}
              </span>
              <button
                role="switch"
                aria-checked={c.enabled}
                aria-label={`${c.enabled ? "Pausar" : "Ativar"} ${c.title}`}
                className="au-switch lg"
                onClick={async () => {
                  try {
                    await agent.toggleCron(c);
                    setJobs(jobs!.map((y) => (y.id === c.id ? { ...y, enabled: !y.enabled } : y)));
                  } catch {
                    toast("Não consegui alterar o agendamento");
                  }
                }}
              >
                <span />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
