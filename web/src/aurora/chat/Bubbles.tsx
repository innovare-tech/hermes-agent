import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../Icon";
import { ApprovalCard } from "../ops/ApprovalCard";
import { toast } from "../store";
import { approvalCopy } from "./approvalCopy";
import { parseAttachRefs } from "./attachments";
import { ErrorCard } from "./ErrorCard";
import { statLine } from "./gateway";
import { Markdown } from "./Markdown";
import { Reasoning } from "./Reasoning";
import { ToolTimeline } from "./ToolTimeline";
import type { AgentMessage, ApprovalChoice, Block, UserMessage } from "./types";

/** Mensagem do usuário com mais que isto fica recolhida ("mostrar mais"). */
export const LONG_CHARS = 1600;
const PREVIEW_CHARS = 700;

export const isLong = (t: string) => t.length > LONG_CHARS || t.split("\n").length > 18;
/** Início de uma mensagem longa: corta no limite sem partir uma linha ao meio quando dá. */
export function previewOf(t: string): string {
  const head = t.slice(0, PREVIEW_CHARS);
  const nl = head.lastIndexOf("\n");
  return (nl > PREVIEW_CHARS * 0.5 ? head.slice(0, nl) : head).trimEnd();
}

export function UserBubble({ m, canEdit, onEdit }: { m: UserMessage; canEdit: boolean; onEdit: (text: string) => void }) {
  const [more, setMore] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.text);
  const area = useRef<HTMLTextAreaElement>(null);
  // Depois de recarregar, os anexos voltam como "@image:caminho" no texto: viram chips iguais aos do envio.
  const parsed = useMemo(() => parseAttachRefs(m.text), [m.text]);
  const shown = parsed.text;
  const chips = m.attachments?.length ? m.attachments : parsed.attachments;
  const long = isLong(shown);
  useEffect(() => {
    if (editing) {
      area.current?.focus();
      area.current?.setSelectionRange(draft.length, draft.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);
  const save = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== m.text.trim()) onEdit(t);
  };
  return (
    <div className="au-user" style={{ display: "flex", justifyContent: "flex-end", animation: "hblurin .6s cubic-bezier(.2,.7,.2,1) both" }}>
      {editing ? (
        <div className="au-edit">
          <textarea
            ref={area}
            aria-label="Editar sua mensagem"
            value={draft}
            rows={Math.min(12, Math.max(3, draft.split("\n").length))}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
            }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: "var(--fg3)", marginRight: "auto" }}>Isto apaga a resposta e tudo o que veio depois, e o Hermes responde de novo.</span>
            <button className="au-outline" onClick={() => setEditing(false)}>Cancelar</button>
            <button className="au-primary" onClick={save} disabled={!draft.trim()}>Enviar de novo</button>
          </div>
        </div>
      ) : (
        <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {!!chips.length && (
            <div className="au-sentatt">
              {chips.map((a, i) => (
                <span key={i} className="au-achip" title={a.name}>
                  {a.preview ? <img src={a.preview} alt="" /> : <Icon name={a.kind === "pdf" ? "file-text" : "paperclip"} size={14} />}
                  <span className="au-achip-name">{a.name}</span>
                </span>
              ))}
            </div>
          )}
          {(shown || !chips.length) && (
          <div className="au-ubody" style={{ padding: "12px 16px", borderRadius: "var(--r) var(--r) 4px var(--r)", background: "var(--panel2)", fontSize: 14.5, lineHeight: 1.55, textWrap: "pretty", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {long && !more ? previewOf(shown) + "…" : shown}
            {long && (
              <button className="au-more" aria-expanded={more} onClick={() => setMore(!more)} style={{ display: "block", marginTop: 8 }}>
                {more ? "Mostrar menos" : `Mostrar mais · ${shown.length.toLocaleString("pt-BR")} caracteres`}
              </button>
            )}
          </div>
          )}
          {canEdit && (
            <div className="au-uactions">
              <button className="au-mini" title="Editar e enviar de novo" aria-label="Editar a mensagem" onClick={() => { setDraft(m.text); setEditing(true); }}>
                <Icon name="pencil" size={12} />
              </button>
              <button className="au-mini" title="Copiar" aria-label="Copiar a mensagem" onClick={() => navigator.clipboard.writeText(shown || m.text).then(() => toast("Copiado"), () => {})}>
                <Icon name="copy" size={12} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type AgentProps = {
  m: AgentMessage;
  /** Última resposta da conversa: só ela tem Refazer e Desfazer. */
  isLast: boolean;
  busy: boolean;
  onRetry: () => void;
  onUndo: () => void;
  onSwitchModel: () => void;
  onCron: () => void;
  onAnswer: (c: ApprovalChoice) => void;
};

export function AgentBubble({ m, isLast, busy, onRetry, onUndo, onSwitchModel, onCron, onAnswer }: AgentProps) {
  const running = m.steps.some((s) => s.status === "run");
  const pending = m.approval?.status === "pending";
  const copy = approvalCopy(m.approval?.description ?? "", m.approval?.tool);
  const stat = statLine(m.stat);
  const empty = !m.live && !m.text && !m.error && !m.steps.length && !m.reasoning && !m.approval;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "30px minmax(0,1fr)", gap: 14, animation: "hblurin .7s cubic-bezier(.2,.7,.2,1) both" }}>
      <div aria-hidden="true" style={{ width: 30, height: 30, borderRadius: "var(--r2)", background: "var(--accSoft)", color: "var(--acc)", display: "grid", placeItems: "center", fontSize: 15 }}>☤</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0, paddingTop: 4 }} aria-live={m.live ? "polite" : undefined}>
        {m.reasoning && <Reasoning text={m.reasoning} ms={m.thinkMs} since={m.thinkStart} live={m.live} />}
        {m.steps.length > 0 && <ToolTimeline steps={m.steps} secs={m.stat?.secs} />}
        {pending && m.approval && (
          <ApprovalCard
            icon="square-terminal"
            title={copy.title}
            meta="comando · agora"
            why={copy.why}
            preview={m.approval.command || m.approval.description}
            detail={copy.original && copy.original !== m.approval.command ? copy.original : undefined}
            source="pedido nesta conversa"
            onApprove={() => onAnswer("once")}
            onDeny={() => onAnswer("deny")}
            extra={
              <>
                {m.approval.choices.includes("session") && (
                  <button className="au-outline" title="Libera este tipo de comando até o fim desta conversa" onClick={() => onAnswer("session")}>
                    Nesta sessão
                  </button>
                )}
                {m.approval.choices.includes("always") && (
                  <button className="au-outline" title="Libera este tipo de comando em todas as conversas, sem perguntar de novo" onClick={() => onAnswer("always")}>
                    Sempre
                  </button>
                )}
              </>
            }
          />
        )}
        {m.approval && !pending && !(m.approval.status === "denied" && m.steps.some((s) => s.status === "denied")) && (
          <span style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11.5, color: m.approval.status === "approved" ? "var(--ok)" : "var(--fg3)" }}>
            <Icon name={m.approval.status === "approved" ? "circle-check" : "circle"} size={12} />
            {m.approval.status === "approved" ? "aprovado por você" : m.approval.status === "denied" ? "negado por você" : "pedido expirou"} · {m.approval.command}
          </span>
        )}
        {m.live && !running && !m.text && !pending && (
          <div role="status" aria-label="Pensando" style={{ display: "flex", gap: 5, padding: "6px 0" }}>
            {[0, 1, 2].map((d) => (
              <span key={d} className="au-live-dot" />
            ))}
          </div>
        )}
        {m.text && <Markdown text={m.text} tail={m.live && !running && !pending ? <span className="au-caret" aria-hidden="true" /> : undefined} />}
        {m.blocks?.map((b, i) => <BlockView key={i} b={b} onCron={onCron} />)}
        {m.error && <ErrorCard error={m.error} onRetry={isLast && !busy ? onRetry : undefined} onSwitchModel={isLast ? onSwitchModel : undefined} />}
        {(m.interrupted || empty) && (
          <span className="au-interrupted" role="status">
            <Icon name="square" size={10} />
            {m.interrupted ? "interrompido" : "sem resposta"}
          </span>
        )}
        {!m.live && (!!m.text || m.interrupted) && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", fontFamily: "var(--fm)", fontSize: 10.5, color: "var(--fg3)" }}>
            {stat && <span title="Modelo · tempo · tokens gastos neste turno (entrada + saída, somando as chamadas ao modelo)">{stat}</span>}
            <span style={{ display: "flex", gap: 4 }}>
              {!!m.text && (
                <button className="au-mini" title="Copiar" aria-label="Copiar" onClick={() => navigator.clipboard.writeText(m.text).then(() => toast("Copiado"), () => {})}>
                  <Icon name="copy" size={12} />
                </button>
              )}
              {isLast && (
                <>
                  <button className="au-mini" disabled={busy} title="Refazer: gera esta resposta de novo, no lugar desta" aria-label="Refazer" onClick={onRetry}>
                    <Icon name="rotate-ccw" size={12} />
                  </button>
                  <button className="au-mini" disabled={busy} title="Desfazer: apaga esta pergunta e resposta e devolve o texto ao campo" aria-label="Desfazer" onClick={onUndo}>
                    <Icon name="undo-2" size={12} />
                  </button>
                </>
              )}
            </span>
            {m.learned && (
              <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, color: "var(--ok)", animation: "hpop .7s .2s cubic-bezier(.3,1.5,.5,1) both" }}>
                <Icon name="sparkles" size={11} />
                {m.learned}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function BlockView({ b, onCron }: { b: Block; onCron: () => void }) {
  if (b.kind === "cron")
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: "var(--r)", background: "var(--accSoft)", border: "1px solid var(--line)" }}>
        <div style={{ width: 38, height: 38, borderRadius: "var(--r2)", background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}>
          <Icon name="calendar-clock" size={17} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 500 }}>{b.title}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg2)" }}>{b.detail}</span>
        </div>
        <button className="au-btn" onClick={onCron} style={{ marginLeft: "auto" }}>
          Ver agendamento
        </button>
      </div>
    );
  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
      {b.items.map((pr, i) => {
        const c = `var(--${pr.tone})`;
        return (
          <div key={pr.n} style={{ display: "grid", gridTemplateColumns: "44px minmax(0,1fr) auto", gap: 12, alignItems: "start", padding: "13px 16px", borderBottom: "1px solid var(--line)", animation: "hup .4s cubic-bezier(.2,.7,.2,1) both", animationDelay: i * 45 + "ms" }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--fg3)", paddingTop: 1 }}>#{pr.n}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
              <span style={{ fontSize: 13.5, fontWeight: 500 }}>{pr.title}</span>
              <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>{pr.note}</span>
            </div>
            <span style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--fm)", fontSize: 10.5, padding: "3px 9px", borderRadius: 999, color: c, border: `1px solid ${c}`, whiteSpace: "nowrap" }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: c }} />
              {pr.tag}
            </span>
          </div>
        );
      })}
    </div>
  );
}

