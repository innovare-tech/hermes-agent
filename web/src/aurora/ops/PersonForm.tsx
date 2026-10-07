import { useState } from "react";
import type { Business, Person } from "../adapter";
import { spot } from "../Chrome";

type Draft = Omit<Person, "id" | "initials" | "waitingHours"> & { id?: string };

const FIELDS: { key: "name" | "role" | "tone" | "channels" | "lastTopic"; label: string; placeholder: string }[] = [
  { key: "name", label: "Nome", placeholder: "Maria Silva" },
  { key: "role", label: "Papel", placeholder: "Fornecedora · hospedagem" },
  { key: "tone", label: "Tom preferido", placeholder: "Cordial, gosta de prazos claros" },
  { key: "channels", label: "Canais", placeholder: "WhatsApp, Email" },
  { key: "lastTopic", label: "Último assunto", placeholder: "Reajuste do contrato" },
];

/** Criar/editar um contato. Pendências: uma por linha. */
export function PersonForm({ initial, businesses, onSave, onCancel }: { initial?: Person; businesses: Business[]; onSave: (p: Draft) => void; onCancel: () => void }) {
  const [p, setP] = useState<Draft>(initial ?? { name: "", role: "", business: "", tone: "", channels: "", lastTopic: "", pending: [] });
  const [pending, setPending] = useState((initial?.pending ?? []).join("\n"));
  return (
    <form
      className="au-card"
      onMouseMove={spot}
      onSubmit={(e) => {
        e.preventDefault();
        if (p.name.trim()) onSave({ ...p, name: p.name.trim(), pending: pending.split("\n").map((x) => x.trim()).filter(Boolean) });
      }}
      style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}
    >
      <span className="au-display" style={{ fontSize: 22 }}>{initial ? "Editar contato" : "Novo contato"}</span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
        {FIELDS.map((f) => (
          <label key={f.key} className="au-field">
            <span className="au-label">{f.label}</span>
            <input required={f.key === "name"} value={p[f.key]} onChange={(e) => setP({ ...p, [f.key]: e.target.value })} placeholder={f.placeholder} />
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
