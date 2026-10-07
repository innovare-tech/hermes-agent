import { useState } from "react";
import { useNavigate } from "react-router";
import type { Person } from "../adapter";
import { PageHeader } from "../Chrome";
import { Icon } from "../Icon";
import { PersonCard } from "../ops/PersonCard";
import { PersonForm } from "../ops/PersonForm";
import { deletePerson, inBiz, savePerson, useStore } from "../store";

/** Pedido para o agente escrever uma mensagem para a pessoa, com o contexto guardado. */
export const draftPrompt = (p: Person) =>
  [
    `Escreva uma mensagem curta para ${p.name}${p.role ? ` (${p.role})` : ""}${p.channels ? `, que prefere ${p.channels}` : ""}.`,
    `Assunto: ${p.pending[0] || p.lastTopic || "retomar o contato"}.`,
    p.tone ? `Tom: ${p.tone}.` : "",
    "Me mostre o texto antes de enviar qualquer coisa.",
  ]
    .filter(Boolean)
    .join(" ");

export function People() {
  const s = useStore((x) => x);
  const navigate = useNavigate();
  const [waitOnly, setWaitOnly] = useState(false);
  const [selId, setSelId] = useState<string | null>(null);
  // null = vendo a ficha; "new" = criando; id = editando
  const [editing, setEditing] = useState<string | null>(null);
  const all = s.people.filter(inBiz(s));
  const list = all.filter((p) => !waitOnly || p.waitingHours > 24);
  const sel = list.find((p) => p.id === selId) ?? list[0];
  const editingPerson = editing && editing !== "new" ? s.people.find((p) => p.id === editing) : undefined;

  return (
    <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
      <div className="au-page">
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <PageHeader title="Pessoas" sub="Todo mundo com quem você fala, em todos os negócios — com o contexto de cada um." noPanic />
          <button className="au-wait" aria-pressed={waitOnly} onClick={() => setWaitOnly(!waitOnly)}>
            <Icon name="hourglass" size={13} />
            Esperando você há +24h
            <span style={{ fontFamily: "var(--fm)", fontSize: 11 }}>{all.filter((p) => p.waitingHours > 24).length}</span>
          </button>
          <button className="au-primary" onClick={() => setEditing("new")}>
            <Icon name="plus" size={14} />
            Novo contato
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16, alignItems: "start" }}>
          <div className="au-card" role="listbox" aria-label="Pessoas" style={{ overflow: "hidden", display: "flex", flexDirection: "column" }}>
            {list.map((p, i) => (
              <button key={p.id} role="option" aria-selected={sel?.id === p.id} className="au-listrow" onClick={() => (setSelId(p.id), setEditing(null))} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", animationDelay: i * 45 + "ms" }}>
                <span className="au-avatar" style={{ width: 34, height: 34, fontSize: 12 }}>{p.initials}</span>
                <span style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{p.name}</span>
                  <span style={{ fontSize: 12, color: "var(--fg2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.role}</span>
                </span>
                {p.waitingHours > 0 && <span className="au-tag" style={{ color: p.waitingHours > 24 ? "var(--err)" : "var(--fg3)", padding: "2px 8px" }}>{p.waitingHours}h</span>}
              </button>
            ))}
            {list.length === 0 && (
              <p style={{ margin: 0, padding: 18, fontSize: 13, lineHeight: 1.55, color: "var(--fg2)" }}>
                {all.length ? "Ninguém esperando há mais de 24h." : "Nenhum contato ainda. Adicione clientes, fornecedores e parceiros com o tom e os canais de cada um — o Hermes usa isso ao escrever por você."}
              </p>
            )}
          </div>
          {editing ? (
            <PersonForm
              key={editing}
              initial={editingPerson}
              businesses={s.businesses}
              onCancel={() => setEditing(null)}
              onSave={async (p) => {
                const saved = await savePerson({ ...p, id: editingPerson?.id });
                if (saved) {
                  setSelId(saved.id);
                  setEditing(null);
                }
              }}
            />
          ) : (
            sel && (
              <PersonCard
                p={sel}
                businessName={s.businesses.find((b) => b.id === sel.business)?.name ?? "—"}
                onDraft={() => navigate(`/chat?q=${encodeURIComponent(draftPrompt(sel))}`)}
                onHistory={() => navigate(`/sessions?q=${encodeURIComponent(sel.name)}`)}
                onEdit={() => setEditing(sel.id)}
                onDelete={() => deletePerson(sel.id)}
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}
