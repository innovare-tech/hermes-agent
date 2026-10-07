import { useState } from "react";
import { agent, useAgentData } from "../agent";
import type { ApiKey } from "../agent/types";
import { Icon } from "../Icon";
import { toast } from "../store";

const TABS = [
  { id: "provider", label: "Modelos" },
  { id: "tool", label: "Ferramentas" },
  { id: "custom", label: "Outras" },
] as const;

function Row({ k, onChange }: { k: ApiKey; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const save = async () => {
    if (!value.trim()) return;
    try {
      await agent.setApiKey(k.key, value.trim());
      toast(`${k.key} salva`);
      setEditing(false);
      setValue("");
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui salvar");
    }
  };
  const remove = async () => {
    if (!window.confirm(`Remover ${k.key}?`)) return;
    try {
      await agent.deleteApiKey(k.key);
      toast(`${k.key} removida`);
      onChange();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui remover");
    }
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "11px 16px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", flex: "none", background: k.isSet ? "var(--ok)" : "var(--line2)" }} />
        <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 12.5 }}>{k.key}</span>
          <span style={{ fontSize: 12, color: "var(--fg3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {k.isSet ? k.preview : k.description}
          </span>
        </span>
        {k.url && !k.isSet && (
          <a href={k.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: "var(--acc)", flex: "none" }}>
            obter
          </a>
        )}
        <button className="au-mini" aria-label={`${k.isSet ? "Trocar" : "Definir"} ${k.key}`} title={k.isSet ? "Trocar" : "Definir"} onClick={() => setEditing(!editing)}>
          <Icon name={k.isSet ? "pencil" : "plus"} size={13} />
        </button>
        {k.isSet && (
          <button className="au-mini danger" aria-label={`Remover ${k.key}`} title="Remover" onClick={remove}>
            <Icon name="trash-2" size={13} />
          </button>
        )}
      </div>
      {editing && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          style={{ display: "flex", gap: 8 }}
        >
          <input aria-label={`Valor de ${k.key}`} type="password" autoComplete="off" autoFocus value={value} onChange={(e) => setValue(e.target.value)} placeholder="cole a chave" className="au-inline" style={{ flex: 1 }} />
          <button type="submit" className="au-primary" style={{ opacity: value.trim() ? 1 : 0.5 }}>
            Salvar
          </button>
        </form>
      )}
    </div>
  );
}

/** Chaves do .env desta máquina (provedores de modelo e ferramentas). O valor salvo nunca volta para a tela. */
export function ApiKeysEditor({ onChange }: { onChange?: () => void }) {
  const [keys, , reload] = useAgentData(() => agent.apiKeys(), []);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("provider");
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = (keys ?? [])
    .filter((k) => k.category === tab && (!needle || k.key.toLowerCase().includes(needle) || k.description.toLowerCase().includes(needle)))
    .sort((a, b) => Number(b.isSet) - Number(a.isSet) || Number(a.advanced) - Number(b.advanced) || a.key.localeCompare(b.key));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div role="tablist" aria-label="Tipo de chave" style={{ display: "flex", gap: 4, padding: 4, borderRadius: "var(--r)", background: "var(--panel2)" }}>
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className="au-seg au-seg-lg" onClick={() => setTab(t.id)}>
              {t.label} {keys ? `· ${keys.filter((k) => k.category === t.id && k.isSet).length}` : ""}
            </button>
          ))}
        </div>
        <input aria-label="Buscar chave" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar (OPENROUTER, ANTHROPIC…)" className="au-inline" style={{ flex: 1, minWidth: 180, padding: "8px 12px", border: "1px solid var(--line2)", borderRadius: "var(--r2)", background: "var(--panel)" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", border: "1px solid var(--line)", borderRadius: "var(--r)", background: "var(--panel)", maxHeight: 420, overflow: "auto" }}>
        {list.map((k) => (
          <Row
            key={k.key}
            k={k}
            onChange={() => {
              reload();
              onChange?.();
            }}
          />
        ))}
        {keys && list.length === 0 && <p style={{ margin: 0, padding: 16, fontSize: 13, color: "var(--fg3)" }}>Nada aqui{needle ? " com esse nome" : ""}.</p>}
      </div>
    </div>
  );
}
