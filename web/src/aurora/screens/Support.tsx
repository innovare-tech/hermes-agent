import { useState } from "react";
import { BizTag, PageHeader, spot } from "../Chrome";
import { Icon } from "../Icon";
import { TICKET_STATUS, TicketDetail } from "../ops/TicketDetail";
import { inBiz, ticketCard, ticketReply, useStore } from "../store";

export function Support() {
  const s = useStore((x) => x);
  const [selN, setSelN] = useState(2041);
  const tickets = s.tickets.filter(inBiz(s));
  const sel = tickets.find((t) => t.n === selN) ?? tickets[0];
  const kpis = [
    { v: String(tickets.filter((t) => t.status !== "resolvido").length), l: "tickets abertos", c: "var(--fg)" },
    { v: s.support.firstResponse, l: "primeira resposta (média)", c: "var(--fg)" },
    { v: s.support.resolvedByHermes, l: "resolvidos pelo Hermes", c: "var(--ok)" },
    { v: s.support.csat, l: "satisfação (CSAT)", c: "var(--acc)" },
  ];
  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <PageHeader title="Suporte" sub="Tickets de todos os seus sistemas. O Hermes responde, cruza com os logs, encontra o erro e propõe a correção." noPanic />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 12 }}>
          {kpis.map((k, i) => (
            <div key={k.l} className="au-card" onMouseMove={spot} style={{ padding: 18, display: "flex", flexDirection: "column", gap: 8, animation: "hpop .6s cubic-bezier(.3,1.4,.5,1) both", animationDelay: i * 80 + "ms" }}>
              <span className="au-display" style={{ lineHeight: 1, fontSize: 32, color: k.c }}>{k.v}</span>
              <span style={{ fontSize: 12.5, color: "var(--fg2)" }}>{k.l}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(340px,1fr))", gap: 16, alignItems: "start" }}>
          <div className="au-card" role="listbox" aria-label="Tickets" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {tickets.map((t, i) => {
              const c = TICKET_STATUS[t.status] ?? "var(--fg3)";
              return (
                <button key={t.n} role="option" aria-selected={sel?.n === t.n} className="au-listrow" onClick={() => setSelN(t.n)} style={{ display: "grid", gridTemplateColumns: "52px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "14px 16px", animationDelay: i * 45 + "ms" }}>
                  <span style={{ fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg3)" }}>#{t.n}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.title}</span>
                    <span style={{ display: "flex", gap: 8, alignItems: "center", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden" }}>
                      {t.client} · {t.system}
                      <BizTag id={t.business} />
                    </span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span className="au-tag" style={{ color: c }}>{t.status}</span>
                    <span style={{ fontFamily: "var(--fm)", fontSize: 10, color: "var(--fg3)" }}>
                      {t.owner} · {t.sla}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          {sel && <TicketDetail t={sel} onCard={() => ticketCard(sel)} onReply={() => ticketReply(sel)} />}
        </div>

        <div className="au-card" onMouseMove={spot} style={{ padding: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
            <span className="au-label">Base de conhecimento · escrita pelo Hermes</span>
            <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>usada em {s.support.kbUsage} das respostas</span>
          </div>
          {s.kb.map((a) => (
            <div key={a.title} style={{ display: "grid", gridTemplateColumns: "20px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "11px 0", borderTop: "1px solid var(--line)" }}>
              <Icon name="book-open-text" size={14} color="var(--fg2)" />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 13.5, fontWeight: 500 }}>{a.title}</span>
                <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>{a.source}</span>
              </span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>{a.uses} usos</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
