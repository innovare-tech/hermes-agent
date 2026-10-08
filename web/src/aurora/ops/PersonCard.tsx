import { useState } from "react";
import { matchesPerson, type InboxItem, type Person } from "../adapter";
import { spot } from "../Chrome";
import { Icon } from "../Icon";
import { ask } from "../store";

type Props = {
  p: Person;
  businessName: string;
  inbox: InboxItem[];
  onDraft: () => void;
  onOpenMessage: (id: string) => void;
  onDone: (pending: string) => void;
  onEdit: () => void;
  onDelete: () => void;
};

/** Ficha de uma pessoa: espera, contexto, identificadores, pendências (marcáveis) e as mensagens dela. */
export function PersonCard({ p, businessName, inbox, onDraft, onOpenMessage, onDone, onEdit, onDelete }: Props) {
  const [history, setHistory] = useState(false);
  const wc = p.waitingHours > 24 ? "var(--err)" : "var(--acc)";
  const hasHandle = !!(p.handles.phone || p.handles.telegram || p.handles.email);
  const messages = hasHandle ? inbox.filter((m) => matchesPerson(m, p.handles)) : [];
  const fields = [
    { k: "Negócio", v: businessName },
    { k: "Último assunto", v: p.lastTopic },
    { k: "Tom preferido", v: p.tone },
    { k: "Telefone / WhatsApp", v: p.handles.phone },
    { k: "Telegram", v: p.handles.telegram },
    { k: "E-mail", v: p.handles.email },
  ].filter((f) => f.v);
  return (
    <div className="au-card" onMouseMove={spot} style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span className="au-avatar" style={{ width: 56, height: 56, fontSize: 16 }}>{p.initials}</span>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0 }}>
          <span className="au-display" style={{ lineHeight: 1, fontSize: 28 }}>{p.name}</span>
          {p.role && <span style={{ fontSize: 13, color: "var(--fg2)" }}>{p.role}</span>}
        </div>
      </div>
      {p.waitingHours > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: "var(--r2)", border: `1px solid ${wc}`, fontSize: 13 }}>
          <Icon name="hourglass" size={14} color={wc} />
          Esperando sua resposta há {p.waitingHours}h
        </div>
      )}
      {fields.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 16 }}>
          {fields.map((f) => (
            <div key={f.k} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="au-label">{f.k}</span>
              <span style={{ fontSize: 13.5, lineHeight: 1.5, overflowWrap: "anywhere" }}>{f.v}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="au-label">Pendências</span>
        {p.pending.length === 0 && <span style={{ fontSize: 13, color: "var(--fg3)" }}>Nada pendente.</span>}
        {p.pending.map((pd) => (
          <label key={pd} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13.5, cursor: "pointer" }}>
            <input type="checkbox" onChange={() => onDone(pd)} style={{ width: 16, height: 16, accentColor: "var(--acc)" }} />
            {pd}
          </label>
        ))}
      </div>
      {history && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="au-label">Mensagens de {p.name.split(" ")[0]}</span>
          {messages.length === 0 && <span style={{ fontSize: 13, color: "var(--fg3)" }}>Nenhuma mensagem ainda com esses identificadores.</span>}
          {messages.slice(0, 8).map((m) => (
            <button key={m.id} className="au-need" onClick={() => onOpenMessage(m.id)} style={{ textAlign: "left" }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: 12, color: "var(--fg3)" }}>
                  {m.channel} · {m.receivedAt}
                </span>
                <span style={{ fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.summary || m.message}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <button className="au-primary" onClick={onDraft}>
          <Icon name="pen-line" size={14} />
          Rascunhar mensagem
        </button>
        <button className="au-outline" onClick={() => setHistory(!history)} disabled={!hasHandle} title={hasHandle ? undefined : "Adicione telefone, Telegram ou e-mail para achar as mensagens"}>
          {history ? "Esconder mensagens" : "Ver mensagens"}
        </button>
        {!hasHandle && <span style={{ fontSize: 12, color: "var(--fg3)" }}>Adicione um identificador para ver as mensagens.</span>}
        <button className="au-mini" title="Editar" aria-label="Editar contato" onClick={onEdit} style={{ marginLeft: "auto", width: 36, height: 36 }}>
          <Icon name="pencil" size={14} />
        </button>
        <button className="au-mini danger" title="Remover" aria-label="Remover contato" onClick={async () => (await ask({ title: `Remover ${p.name}?`, body: "O contato e as pendências dele somem.", confirm: "Remover", danger: true })) && onDelete()} style={{ width: 36, height: 36 }}>
          <Icon name="trash-2" size={14} />
        </button>
      </div>
    </div>
  );
}
