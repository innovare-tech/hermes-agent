import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import type { Priority } from "../adapter";
import { BizTag, CHANNEL_ICON, NotConnectedPage } from "../Chrome";
import { Icon } from "../Icon";
import { INBOX_TABS, InboxList, PRIORITY } from "../ops/InboxList";
import { archiveInbox, inBiz, keepInbox, replyInbox, useStore } from "../store";

export function Inbox() {
  const s = useStore((x) => x);
  const navigate = useNavigate();
  const [tab, setTab] = useState<Priority | null>(null);
  // "Precisa de você" do Painel abre direto no item (?sel=id).
  const [params] = useSearchParams();
  const [selId, setSelId] = useState<string | null>(params.get("sel"));
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const all = s.inbox.filter(inBiz(s));
  const list = all.filter((x) => !tab || x.priority === tab);
  const sel = list.find((x) => x.id === selId) ?? list[0];
  const draft = sel ? (drafts[sel.id] ?? sel.suggestedReply) : "";

  // ↑/↓ ou j/k navegam, A aprova e envia, I ignora — fora de campos de texto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || e.metaKey || e.ctrlKey || e.altKey) return;
      const i = sel ? list.indexOf(sel) : -1;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        const n = list[Math.min(list.length - 1, i + 1)];
        if (n) setSelId(n.id);
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        const n = list[Math.max(0, i - 1)];
        if (n) setSelId(n.id);
      } else if (e.key === "a" && sel && sel.suggestedReply && !sel.sentAt) replyInbox(sel, draft);
      else if (e.key === "i" && sel) archiveInbox(sel.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const p = sel ? PRIORITY[sel.priority] : null;
  const actionable = !!sel && !sel.sentAt && !!sel.suggestedReply;

  if (s.inbox.length === 0)
    return (
      <NotConnectedPage
        title="Caixa de entrada"
        sub="Uma caixa só para WhatsApp, Telegram, Discord, e-mail e grupos."
        icon="inbox"
        what="Nenhuma mensagem ainda."
        needs="Tudo que chegar pelos gateways de mensagem aparece aqui, com a autonomia de cada canal: Observar, Rascunhar (a resposta espera você em Aprovações) ou Autônomo. Ligue e conecte as plataformas em Gateways."
        action={
          <button className="au-outline" onClick={() => navigate("/gateways")} style={{ marginTop: 6 }}>
            Abrir Gateways
          </button>
        }
      />
    );
  return (
    <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(260px,340px) minmax(0,1fr)", minHeight: 0, animation: "hblurin .6s both" }}>
      <div style={{ display: "flex", flexDirection: "column", minHeight: 0, borderRight: "1px solid var(--line)" }}>
        <div style={{ padding: "26px 18px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 className="au-h1" style={{ fontSize: "calc(var(--h1) * .78)" }}>Caixa de entrada</h1>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {INBOX_TABS.map(([label, k]) => (
              <button key={label} className="au-pill" aria-pressed={tab === k} onClick={() => setTab(k)}>
                {label}
                <span style={{ fontFamily: "var(--fm)", fontSize: 10.5, opacity: 0.7 }}>{all.filter((x) => !k || x.priority === k).length}</span>
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", minHeight: 0, padding: "0 10px 12px" }}>
          <InboxList items={list} selected={sel?.id} onPick={setSelId} />
        </div>
        <div style={{ padding: "10px 18px", borderTop: "1px solid var(--line)", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>↑↓ navegar · A aprovar e enviar · I ignorar</div>
      </div>

      <div style={{ overflow: "auto", minHeight: 0 }}>
        {sel && p && (
          <div key={sel.id} style={{ maxWidth: 720, margin: "0 auto", padding: "30px 32px 48px", display: "flex", flexDirection: "column", gap: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span className="au-avatar" style={{ width: 48, height: 48, fontSize: 16 }}>{sel.initials}</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0, flex: 1 }}>
                <span className="au-display" style={{ lineHeight: 1, fontSize: 24 }}>{sel.from}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)", flexWrap: "wrap" }}>
                  <Icon name={CHANNEL_ICON[sel.channel] ?? "message-circle"} size={11} />
                  {sel.channel} · {sel.receivedAt}
                  <BizTag id={sel.business} />
                </span>
              </div>
              <span className="au-tag" style={{ color: p.color }}>{p.label}</span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="au-label">Mensagem</span>
              <div style={{ padding: "14px 16px", borderRadius: "var(--r) var(--r) var(--r) 4px", background: "var(--panel2)", fontSize: 14.5, lineHeight: 1.6, textWrap: "pretty" }}>{sel.message}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <span className="au-label">O que eu sei</span>
              {sel.context.map((c) => (
                <div key={c} style={{ display: "flex", gap: 10, alignItems: "flex-start", minHeight: 23, fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
                  <Icon name="brain" size={13} color="var(--acc)" className="au-mt3" />
                  {c}
                </div>
              ))}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center" }}>
                <span className="au-label">{sel.sentAt ? "Resposta enviada" : sel.suggestedReply ? "Resposta sugerida" : "Sem resposta necessária"}</span>
                <span style={{ marginLeft: "auto", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>neste canal: {sel.autonomyMode}</span>
              </div>
              <div style={{ position: "relative" }}>
                <div className="au-ring" style={{ inset: -14, borderRadius: "calc(var(--r) + 14px)", background: "conic-gradient(from var(--ang),transparent 0deg,var(--acc) 50deg,transparent 120deg,transparent 180deg,var(--acc) 230deg,transparent 300deg)", animationDuration: "6s", filter: "blur(22px)", opacity: sel.sentAt ? 0 : 0.35 }} />
                <div className="au-ring" style={{ inset: 0, borderRadius: "var(--r)", background: "conic-gradient(from var(--ang),var(--line2) 0deg,var(--acc) 50deg,var(--line2) 120deg,var(--line2) 180deg,var(--acc) 230deg,var(--line2) 300deg)", animationDuration: "6s", opacity: sel.sentAt ? 0 : 1 }} />
                <textarea
                  aria-label="Resposta"
                  value={draft}
                  readOnly={!!sel.sentAt}
                  onChange={(e) => setDrafts({ ...drafts, [sel.id]: e.target.value })}
                  rows={4}
                  style={{ position: "relative", zIndex: 1, display: "block", width: "100%", resize: "vertical", padding: "14px 16px", border: "1px solid transparent", backgroundClip: "padding-box", borderRadius: "var(--r)", backgroundColor: "var(--panel)", color: "var(--fg)", fontSize: 14.5, lineHeight: 1.6, outline: 0 }}
                />
              </div>
            </div>

            {actionable && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="au-primary" onClick={() => replyInbox(sel, draft)}>
                  <Icon name="send" size={14} />
                  Aprovar e enviar
                </button>
                <button className="au-outline" onClick={() => keepInbox(sel.id)}>
                  Deixar comigo
                </button>
                <button className="au-outline" onClick={() => archiveInbox(sel.id)} style={{ marginLeft: "auto", color: "var(--fg2)" }}>
                  Ignorar
                </button>
              </div>
            )}
            {sel.sentAt && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: "var(--ok)" }}>
                <Icon name="circle-check" size={15} />
                {sel.sentAt}
                <button className="au-outline" onClick={() => archiveInbox(sel.id)} style={{ marginLeft: "auto" }}>
                  Arquivar
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
