import { useState } from "react";
import { Icon } from "../Icon";
import { ask, deleteBusiness, saveBusiness, useStore } from "../store";

const PALETTE = ["#9d8cff", "#3fd0b0", "#f0b45a", "#ff8a9a", "#5eb8ff", "#c6f24e", "#e8b04a", "#b38cff"];

/** Negócios (nome + cor): o seletor da barra lateral e o filtro de todas as telas vêm daqui. */
export function BusinessesEditor() {
  const businesses = useStore((s) => s.businesses);
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  return (
    <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", backdropFilter: "var(--blur)", overflow: "hidden" }}>
      {businesses.map((b) => (
        <div key={b.id} style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
          <input type="color" aria-label={`Cor de ${b.name}`} value={b.color} onChange={(e) => saveBusiness({ ...b, color: e.target.value })} className="au-colorpick" />
          <input
            aria-label="Nome do negócio"
            defaultValue={b.name}
            onBlur={(e) => e.target.value.trim() && e.target.value.trim() !== b.name && saveBusiness({ ...b, name: e.target.value.trim() })}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="au-inline"
          />
          <button className="au-mini danger" title="Remover" aria-label={`Remover ${b.name}`} onClick={async () => (await ask({ title: `Remover o negócio “${b.name}”?`, body: "Canais, pessoas e playbooks ficam sem negócio.", confirm: "Remover", danger: true })) && deleteBusiness(b.id)}>
            <Icon name="trash-2" size={13} />
          </button>
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await saveBusiness({ name: name.trim(), color })) {
            setName("");
            setColor(PALETTE[(businesses.length + 1) % PALETTE.length]);
          }
        }}
        style={{ display: "grid", gridTemplateColumns: "28px minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "11px 16px" }}
      >
        <input type="color" aria-label="Cor do novo negócio" value={color} onChange={(e) => setColor(e.target.value)} className="au-colorpick" />
        <input aria-label="Nome do novo negócio" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do negócio (ex.: Minha Empresa)" className="au-inline" />
        <button type="submit" className="au-outline" style={{ opacity: name.trim() ? 1 : 0.5 }}>
          Adicionar
        </button>
      </form>
    </div>
  );
}
