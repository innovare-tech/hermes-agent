import { useState } from "react";
import type { Business, Person, PersonHandles } from "../adapter";
import { spot } from "../Chrome";

type Draft = Omit<Person, "id" | "initials" | "waitingHours"> & { id?: string };

const FIELDS: { key: "name" | "role" | "tone" | "lastTopic"; label: string; placeholder: string }[] = [
  { key: "name", label: "Nome", placeholder: "Maria Silva" },
  { key: "role", label: "Papel", placeholder: "Fornecedora de hospedagem" },
  { key: "tone", label: "Tom preferido", placeholder: "Cordial, gosta de prazos" },
  { key: "lastTopic", label: "Último assunto", placeholder: "Reajuste do contrato" },
];

const HANDLES: { key: keyof PersonHandles; label: string; placeholder: string; type: string }[] = [
  { key: "phone", label: "Telefone / WhatsApp", placeholder: "+55 11 99999-0000", type: "tel" },
  { key: "telegram", label: "Telegram", placeholder: "@usuario", type: "text" },
  { key: "email", label: "E-mail", placeholder: "maria@empresa.com", type: "email" },
];

/** Os canais que o contato usa, a partir dos identificadores preenchidos. */
export const channelsFrom = (h: PersonHandles) => [h.phone && "WhatsApp/telefone", h.telegram && "Telegram", h.email && "E-mail"].filter(Boolean).join(", ");

/** Criar/editar um contato. Identificadores ligam o contato às mensagens; pendências: uma por linha. */
export function PersonForm({ initial, businesses, onSave, onCancel }: { initial?: Person; businesses: Business[]; onSave: (p: Draft) => void; onCancel: () => void }) {
  const [p, setP] = useState<Draft>(initial ?? { name: "", role: "", business: "", tone: "", channels: "", lastTopic: "", pending: [], handles: {} });
  const [pending, setPending] = useState((initial?.pending ?? []).join("\n"));
  const [error, setError] = useState("");
  return (
    <form
      className="au-card"
      onMouseMove={spot}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!p.name.trim()) return setError("Dê um nome ao contato.");
        onSave({ ...p, name: p.name.trim(), channels: channelsFrom(p.handles), pending: pending.split("\n").map((x) => x.trim()).filter(Boolean) });
      }}
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <span className="au-display" style={{ fontSize: 22 }}>{initial ? "Editar contato" : "Novo contato"}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key} className="au-field">
            <span className="au-label">{f.label}</span>
            <input
              aria-invalid={f.key === "name" && !!error}
              value={p[f.key]}
              onChange={(e) => {
                setP({ ...p, [f.key]: e.target.value });
                if (f.key === "name") setError("");
              }}
              placeholder={f.placeholder}
            />
            {f.key === "name" && error && <span role="alert" style={{ fontSize: 12, color: "var(--err)" }}>{error}</span>}
          </label>
        ))}
        <label className="au-field">
          <span className="au-label">Negócio</span>
          <select value={p.business} onChange={(e) => setP({ ...p, business: e.target.value })}>
            <option value="">sem negócio</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span className="au-label">Como achar as mensagens dessa pessoa</span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
          {HANDLES.map((h) => (
            <label key={h.key} className="au-field">
              <span style={{ fontSize: 12, color: "var(--fg2)" }}>{h.label}</span>
              <input type={h.type} value={p.handles[h.key] ?? ""} onChange={(e) => setP({ ...p, handles: { ...p.handles, [h.key]: e.target.value } })} placeholder={h.placeholder} />
            </label>
          ))}
        </div>
      </div>
      <label className="au-field">
        <span className="au-label">Pendências (uma por linha)</span>
        <textarea rows={3} value={pending} onChange={(e) => setPending(e.target.value)} placeholder="Responder a proposta até quinta" />
      </label>
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="au-primary">
          Salvar
        </button>
        <button type="button" className="au-outline" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
