import { useEffect, useRef, useState } from "react";
import { Icon } from "../Icon";
import { agent } from "../agent";
import type { Provider } from "../agent/types";

type Props = { current: string; onPick: (provider: string, model: string) => void; onClose: () => void };

/** Seletor de modelo ancorado no chip do Composer: provedores conectados → modelos, com busca. */
export function ModelPicker({ current, onPick, onClose }: Props) {
  const [providers, setProviders] = useState<Provider[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    agent.settings().then(
      (s) => {
        setProviders(s.providers);
        if (s.modelError) setError(s.modelError);
      },
      (e: unknown) => {
        setProviders([]);
        setError(e instanceof Error ? e.message : "Não consegui carregar os modelos");
      },
    );
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && onClose();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const groups = (providers ?? [])
    .map((p) => ({ ...p, models: p.models.filter((m) => !needle || m.toLowerCase().includes(needle) || p.name.toLowerCase().includes(needle)) }))
    .filter((p) => p.models.length);

  return (
    <div ref={box} role="dialog" aria-label="Escolher modelo" className="au-picker">
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px 8px", borderBottom: "1px solid var(--line)" }}>
        <Icon name="search" size={13} color="var(--fg3)" />
        <input autoFocus aria-label="Buscar modelo" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar modelo ou provedor" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13 }} />
      </div>
      <div style={{ overflow: "auto", maxHeight: "min(360px, 50vh)", padding: 4 }}>
        {providers === null && <div style={{ padding: 12, fontSize: 12.5, color: "var(--fg3)" }}>Carregando modelos…</div>}
        {error && <div role="alert" style={{ padding: 12, fontSize: 12.5, lineHeight: 1.5, color: "var(--err)" }}>{error}</div>}
        {!error && providers !== null && groups.length === 0 && (
          <div style={{ padding: 12, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg3)" }}>
            {needle ? "Nenhum modelo com esse nome." : "Nenhum provedor com credencial. Adicione uma chave em Configurações → Chaves de API."}
          </div>
        )}
        {groups.map((p) => (
          <div key={p.id} role="group" aria-label={p.name}>
            <div className="au-label" style={{ padding: "10px 10px 4px" }}>{p.name}</div>
            {p.models.map((m) => (
              <button key={p.id + m} role="option" aria-selected={m === current} className="au-slash" style={{ gridTemplateColumns: "minmax(0,1fr) 16px", fontFamily: "var(--fm)", fontSize: 12.5 }} onClick={() => onPick(p.id, m)}>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m}</span>
                {m === current && <Icon name="check" size={13} color="var(--acc)" />}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
