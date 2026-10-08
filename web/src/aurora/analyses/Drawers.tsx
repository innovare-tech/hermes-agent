// Gavetas e diálogo da tela de análises: mensagens ignoradas, "Conversar com o Hermes sobre isto" e "Não era relevante".
import { useState } from "react";
import { CHAT_SUGGESTIONS, IRRELEVANT_REASONS, type Analysis, type IgnoredGroup, type IrrelevantReason } from "./api";
import { AIcon } from "./icons";

const nf = (n: number) => n.toLocaleString("pt-BR");

function DrawerShell({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="an-scrim" onClick={onClose} />
      <aside role="dialog" aria-modal="true" aria-label={label} className="an-drawer">
        {children}
      </aside>
    </>
  );
}

const CloseBtn = ({ onClose }: { onClose: () => void }) => (
  <button title="Fechar" aria-label="Fechar" onClick={onClose} style={{ width: 30, height: 30, flex: "none", display: "grid", placeItems: "center", borderRadius: 9, border: 0, background: "transparent", color: "var(--fg2)", cursor: "pointer" }}>
    <AIcon name="x" size={16} />
  </button>
);

// ---------- ignoradas ----------

export function IgnoredDrawer({ groups, error, flagged, busy, onClose, onFlag, onRetry }: {
  groups: IgnoredGroup[] | null;
  error: boolean;
  /** channelId dos lotes já enviados para análise nesta sessão. */
  flagged: Set<string>;
  busy: string | null;
  onClose: () => void;
  onFlag: (g: IgnoredGroup) => void;
  onRetry: () => void;
}) {
  const total = (groups ?? []).reduce((n, g) => n + g.count, 0);
  return (
    <DrawerShell label="Mensagens ignoradas" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "20px 22px 14px", borderBottom: "1px solid var(--line)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
          <span className="au-display" style={{ fontSize: 20 }}>{groups ? `${nf(total)} ${total === 1 ? "mensagem ignorada" : "mensagens ignoradas"} hoje` : "Mensagens ignoradas hoje"}</span>
          <span style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>Conversa social (bom dia, figurinhas, agradecimentos). O Hermes guardou, mas não analisou nem avisou ninguém.</span>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", padding: "8px 12px 20px" }}>
        {error && (
          <div role="alert" style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, padding: "16px 10px" }}>
            <span style={{ fontSize: 13, color: "var(--fg2)" }}>Não consegui carregar as mensagens ignoradas.</span>
            <button className="an-chip-btn" onClick={onRetry}>Tentar de novo</button>
          </div>
        )}
        {!error && !groups && <div style={{ padding: "16px 10px", fontSize: 12.5, color: "var(--fg3)", display: "flex", gap: 8, alignItems: "center" }}><AIcon name="loader-circle" size={14} className="au-spin" />Carregando…</div>}
        {groups && groups.length === 0 && <div style={{ padding: "16px 10px", fontSize: 13, color: "var(--fg2)" }}>Nenhuma conversa social foi ignorada hoje.</div>}
        {groups?.map((g) => (
          <div key={g.channelId} style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 10px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{g.groupName}</span>
              <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{nf(g.count)} msgs</span>
            </div>
            {g.samples.length > 0 && (
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {g.samples.map((x) => (
                  <span key={x} style={{ padding: "3px 9px", borderRadius: 999, background: "var(--panel2)", fontSize: 12, color: "var(--fg2)", overflowWrap: "anywhere" }}>{x}</span>
                ))}
              </div>
            )}
            {flagged.has(g.channelId) ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ok)" }}>
                <AIcon name="check" size={12} />Enviado para análise. Aparece na lista em até 1 minuto.
              </span>
            ) : (
              <button className="an-chip-btn" disabled={busy === g.channelId} onClick={() => onFlag(g)} style={{ alignSelf: "flex-start" }}>
                <AIcon name={busy === g.channelId ? "loader-circle" : "flag"} size={12} className={busy === g.channelId ? "au-spin" : undefined} />
                Tinha algo importante aqui
              </button>
            )}
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ---------- conversar sobre a análise ----------

/** A pergunta é montada aqui; quem abre decide como levá-la ao Hermes (hoje: Conversa com o texto pronto). */
export function ChatDrawer({ a, onClose, onAsk }: { a: Analysis; onClose: () => void; onAsk: (question: string) => void }) {
  const [text, setText] = useState("");
  const send = (q: string) => q.trim() && onAsk(q.trim());
  return (
    <DrawerShell label="Conversa com o Hermes" onClose={onClose}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 22px 14px", borderBottom: "1px solid var(--line)" }}>
        <span style={{ width: 32, height: 32, borderRadius: 10, background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center" }}><AIcon name="sparkles" size={15} /></span>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600 }}>Hermes</span>
          <span style={{ fontSize: 11.5, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Sobre {a.code}{a.clientName ? ` · ${a.clientName}` : ""}</span>
        </div>
        <CloseBtn onClose={onClose} />
      </div>
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column", gap: 12, padding: "16px 20px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "10px 12px", borderRadius: "var(--r2)", border: "1px dashed var(--line2)", fontSize: 12, color: "var(--fg2)" }}>
          <span style={{ fontWeight: 600, color: "var(--fg)" }}>Contexto anexado</span>
          {a.summary || `${a.messageCount} mensagens de ${a.groupName}`}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--fg2)", lineHeight: 1.5 }}>
          Ao enviar, abro a Conversa com a análise inteira (mensagens, checagens e hipótese) e a sua pergunta já escritas. É só dar Enter lá.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          <span style={{ fontSize: 11.5, color: "var(--fg3)" }}>Sugestões</span>
          {CHAT_SUGGESTIONS.map((s) => (
            <button key={s} className="an-chip-btn" onClick={() => send(s)} style={{ alignSelf: "flex-start", padding: "7px 12px", borderRadius: 999, fontSize: 12.5, textAlign: "left" }}>{s}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && send(text)}
          aria-label="Pergunta sobre esta análise"
          placeholder="Pergunte sobre esta análise"
          style={{ flex: 1, minWidth: 0, padding: "10px 12px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--fg)", fontSize: 13.5, outline: 0 }}
        />
        <button title="Enviar" aria-label="Enviar" disabled={!text.trim()} onClick={() => send(text)} style={{ width: 40, height: 40, flex: "none", borderRadius: "var(--r2)", border: 0, background: "var(--acc)", color: "var(--accFg)", display: "grid", placeItems: "center", cursor: "pointer", opacity: text.trim() ? 1 : 0.4 }}>
          <AIcon name="arrow-up" size={16} />
        </button>
      </div>
    </DrawerShell>
  );
}

// ---------- não era relevante ----------

export function IrrelevantDialog({ a, busy, onClose, onSubmit }: { a: Analysis; busy: boolean; onClose: () => void; onSubmit: (reason: IrrelevantReason, note: string) => void }) {
  const [reason, setReason] = useState<IrrelevantReason | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="an-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={{ zIndex: 60, backdropFilter: "blur(6px)", display: "grid", placeItems: "center", padding: 24 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="an-irr-title" style={{ width: "min(470px,100%)", border: "1px solid var(--line2)", borderRadius: "var(--r)", background: "var(--pop)", boxShadow: "var(--shadow)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "22px 24px 12px" }}>
          <span id="an-irr-title" className="au-display" style={{ fontSize: 20 }}>O que estava errado?</span>
          <span style={{ fontSize: 13, color: "var(--fg2)", lineHeight: 1.5 }}>
            Isso ajuda o Hermes a ajustar a triagem dos grupos{a.clientName ? ` de ${a.clientName}` : ""}. A análise sai da lista.
          </span>
        </div>
        <div role="radiogroup" aria-label="Motivo" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 24px 14px" }}>
          {IRRELEVANT_REASONS.map((o) => {
            const on = reason === o.id;
            return (
              <button key={o.id} role="radio" aria-checked={on} autoFocus={o.id === IRRELEVANT_REASONS[0].id} onClick={() => setReason(o.id)} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 12px", borderRadius: "var(--r2)", border: `1px solid ${on ? "var(--acc)" : "var(--line2)"}`, background: on ? "var(--accSoft)" : "transparent", color: "var(--fg)", fontSize: 13, cursor: "pointer", textAlign: "left" }}>
                <span style={{ width: 16, height: 16, flex: "none", borderRadius: "50%", border: `1.5px solid ${on ? "var(--acc)" : "var(--line2)"}`, display: "grid", placeItems: "center" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: on ? "var(--acc)" : "transparent" }} />
                </span>
                {o.label}
              </button>
            );
          })}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} aria-label="Comentário opcional" placeholder="Comentário opcional (ex.: esse cliente sempre fala assim)" style={{ marginTop: 4, padding: "10px 12px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel2)", color: "var(--fg)", fontSize: 13, outline: 0, resize: "none" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 24px", borderTop: "1px solid var(--line)" }}>
          <button className="au-outline" onClick={onClose}>Cancelar</button>
          <button className="au-primary" disabled={!reason || busy} onClick={() => reason && onSubmit(reason, note.trim())} style={{ opacity: reason && !busy ? 1 : 0.4 }}>
            Enviar e tirar da lista
          </button>
        </div>
      </div>
    </div>
  );
}
