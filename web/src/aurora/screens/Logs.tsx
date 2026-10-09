import { useState } from "react";
import { Icon } from "../Icon";
import { agent, useAgentData } from "../agent";
import type { LogLevel } from "../agent/types";

const LEVEL_COLOR: Record<LogLevel, string> = { INFO: "var(--fg2)", TOOL: "var(--acc)", WARN: "var(--warn)", ERRO: "var(--err)" };
const LEVELS: ("Tudo" | LogLevel)[] = ["Tudo", "INFO", "TOOL", "WARN", "ERRO"];
const LEVEL_LABEL: Record<"Tudo" | LogLevel, string> = { Tudo: "Tudo", INFO: "Info", TOOL: "Ferramentas", WARN: "Avisos", ERRO: "Erros" };
/** Abrir/fechar conexão do painel a cada navegação: ruído, oculto por padrão. */
export const isConnectionNoise = (msg: string) => /\bws (accepted|closed)\b|reaped_sessions=0/.test(msg);

/** Linhas de ciclo de vida que o Hermes registra como WARNING só para aparecerem no terminal (ex.: conectar ao
 * Telegram): aqui são informação, não aviso. */
const LIFECYCLE_WARN = /Connect(ing|ed) to Telegram|Discovering Telegram API fallback IPs/;
export const displayLevel = <T extends { level: LogLevel; msg: string }>(l: T): T =>
  l.level === "WARN" && LIFECYCLE_WARN.test(l.msg) ? { ...l, level: "INFO" as LogLevel } : l;

export function Logs() {
  const [paused, setPaused] = useState(false);
  const [level, setLevel] = useState<"Tudo" | LogLevel>("Tudo");
  const [q, setQ] = useState("");
  const [noise, setNoise] = useState(false);
  // Pausado = não busca mais (o stream congela onde está).
  const [lines] = useAgentData(() => agent.logs(), [], 2200, !paused);
  const needle = q.trim().toLowerCase();
  const rows = lines?.map(displayLevel).filter((l) => (level === "Tudo" || l.level === level) && (noise || !isConnectionNoise(l.msg)) && (!needle || `${l.src} ${l.msg}`.toLowerCase().includes(needle))) ?? [];
  const download = () => {
    const text = rows.map((l) => [l.t, l.level, l.src, l.msg].filter(Boolean).join("  ")).join(String.fromCharCode(10));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    a.download = `hermes-logs-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, padding: "28px 36px", gap: 16, animation: "hblurin .7s cubic-bezier(.2,.7,.2,1) both" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <h1 className="au-h1">Logs</h1>
          <p style={{ margin: 0, color: "var(--fg2)", fontSize: 14.5 }}>Tudo que o agente e o gateway fazem, em tempo real.</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {LEVELS.map((l) => (
            <button key={l} className="au-pill" aria-pressed={level === l} onClick={() => setLevel(l)} style={{ fontSize: 12 }}>
              {LEVEL_LABEL[l]}
            </button>
          ))}
          <button onClick={() => setPaused(!paused)} aria-pressed={paused} style={{ display: "flex", alignItems: "center", gap: 7, padding: "6px 12px", borderRadius: 999, border: "1px solid var(--line2)", background: "var(--panel)", color: "var(--fg)", fontSize: 12, cursor: "pointer" }}>
            <Icon name={paused ? "play" : "pause"} size={12} />
            {paused ? "Continuar atualizando" : "Congelar rolagem"}
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: "var(--r2)", border: "1px solid var(--line2)", background: "var(--panel)", flex: "1 1 260px", maxWidth: 420 }}>
          <Icon name="search" size={14} color="var(--fg3)" />
          <input aria-label="Buscar nos logs" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nos logs" style={{ flex: 1, border: 0, outline: 0, background: "transparent", color: "var(--fg)", fontSize: 13 }} />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--fg2)", cursor: "pointer" }}>
          <input type="checkbox" checked={noise} onChange={(e) => setNoise(e.target.checked)} />
          Mostrar conexões do painel
        </label>
        <button className="au-outline" onClick={download} disabled={!rows.length} style={{ marginLeft: "auto" }}>
          Baixar o que está na tela
        </button>
      </div>
      <div role="log" aria-live="polite" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column-reverse", overflow: "auto", padding: "14px 4px", borderRadius: "var(--r)", background: "var(--code)", border: "1px solid var(--line)", fontFamily: "var(--fm)", fontSize: 12, lineHeight: 1.75 }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {lines && rows.length === 0 && <div style={{ padding: "8px 14px", color: "var(--fg3)", fontFamily: "var(--fb)", fontSize: 13 }}>Nenhuma linha{needle || level !== "Tudo" ? " com esse filtro" : " ainda"}.</div>}
          {rows.map((l) => (
            <div key={l.id} className="au-logrow">
              <span style={{ color: "var(--fg3)" }}>{l.t}</span>
              <span style={{ color: LEVEL_COLOR[l.level], fontWeight: 500 }}>{l.level}</span>
              <span style={{ color: "var(--fg2)" }}>{l.src}</span>
              <span style={{ color: "var(--fg)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{l.msg}</span>
            </div>
          ))}
          {!paused && (
            <div aria-hidden="true" style={{ padding: "2px 14px", color: "var(--acc)" }}>
              <span className="au-caret" style={{ width: 6, height: 13 }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
