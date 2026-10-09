import { useNavigate } from "react-router";
import { Icon } from "../Icon";
import { money } from "./gateway";
import type { ContextBreakdown, SessionInfo } from "./types";

const k = (n: number) => (n >= 1000 ? (n / 1000).toFixed(1).replace(".", ",") + "k" : String(n));
const num = (n: number) => n.toLocaleString("pt-BR");

const PART_PT: Record<string, string> = {
  system_prompt: "Instruções do sistema",
  tool_definitions: "Definições de ferramentas",
  rules: "Regras",
  subagent_definitions: "Subagentes",
  conversation: "Conversa",
  memory: "Memória",
  skills: "Skills",
  mcp: "Servidores externos (MCP)",
  context_files: "Arquivos de contexto",
};
const COLORS = ["var(--acc)", "var(--ok)", "var(--warn)", "var(--err)", "var(--fg2)", "var(--fg3)"];

type Props = {
  info: SessionInfo;
  breakdown: ContextBreakdown | null;
  /** Conversa sem mensagens: nada para compactar. */
  empty: boolean;
  running: boolean;
  onCompress: () => void;
};

export function ContextPanel({ info, breakdown, empty, running, onCompress }: Props) {
  const navigate = useNavigate();
  const max = info.ctxMax || breakdown?.max || 0;
  const used = info.ctxUsed ?? breakdown?.used ?? null;
  const pct = max && used ? Math.min(100, (used / max) * 100) : 0;
  const u = info.usage;
  const parts = (breakdown?.parts ?? []).filter((p) => p.tokens > 0);
  const total = parts.reduce((s, p) => s + p.tokens, 0) || 1;
  const why = empty ? "Não há o que compactar numa conversa vazia" : running ? "Espere a resposta terminar" : "Resume o começo da conversa para liberar espaço no contexto";
  return (
    <aside
      aria-label="Contexto da sessão"
      style={{ width: 300, flex: "none", borderLeft: "1px solid var(--line)", background: "var(--bg2)", backdropFilter: "var(--blur)", WebkitBackdropFilter: "var(--blur)", overflow: "auto", padding: "20px 20px 28px", display: "flex", flexDirection: "column", gap: 26, animation: "hin .3s ease both" }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="au-label" title="Quanto da conversa o modelo consegue considerar de uma vez. Quando enche, use Compactar.">Janela de contexto</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span className="au-display" style={{ fontSize: 30, lineHeight: 1 }}>{used == null ? "—" : k(used)}</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>de {max ? k(max) : "—"} tokens</span>
        </div>
        <div style={{ height: 6, borderRadius: 6, background: "var(--panel2)", overflow: "hidden" }} role="progressbar" aria-label="Contexto usado" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
          <div style={{ height: "100%", width: pct + "%", background: pct > 85 ? "var(--err)" : "var(--acc)", borderRadius: 6, transition: "width .8s cubic-bezier(.2,.7,.2,1)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="au-link" disabled={empty || running} onClick={onCompress} title={why}>
            Compactar
          </button>
        </div>
        {parts.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", height: 6, borderRadius: 6, overflow: "hidden", gap: 1 }} aria-hidden="true">
              {parts.map((p, i) => (
                <div key={p.id} style={{ width: (p.tokens / total) * 100 + "%", background: COLORS[i % COLORS.length], opacity: 0.85 }} />
              ))}
            </div>
            {parts.map((p, i) => (
              <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--fg2)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], flex: "none" }} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{PART_PT[p.id] ?? p.label}</span>
                <span style={{ fontFamily: "var(--fm)", fontSize: 11, color: "var(--fg3)" }}>{k(p.tokens)}</span>
              </div>
            ))}
            {breakdown?.estimated && <span style={{ fontSize: 11, color: "var(--fg3)" }}>Divisão estimada pelo Hermes; o provedor mostra o número exato depois da primeira resposta.</span>}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <span className="au-label" title="Soma de todas as respostas desta conversa">Tokens e custo da conversa</span>
        {u && u.calls > 0 ? (
          <dl className="au-stats">
            <dt>Entrada</dt>
            <dd>{num(u.input)}</dd>
            <dt>Saída</dt>
            <dd>{num(u.output)}</dd>
            {u.reasoning > 0 && (
              <>
                <dt>Raciocínio</dt>
                <dd>{num(u.reasoning)}</dd>
              </>
            )}
            <dt>Chamadas ao modelo</dt>
            <dd>{num(u.calls)}</dd>
            <dt>Custo</dt>
            <dd title={u.cost == null ? "O provedor deste modelo não informa o custo" : undefined}>{u.cost == null ? "não informado pelo provedor" : money(u.cost)}</dd>
          </dl>
        ) : (
          <span style={{ fontSize: 12.5, color: "var(--fg3)", lineHeight: 1.5 }}>Ainda sem uso nesta conversa. Os números aparecem depois da primeira resposta.</span>
        )}
      </div>

      {info.memories && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="au-label">Memórias usadas</span>
          {info.memories.map((m) => (
            <div key={m} style={{ padding: "10px 12px", borderRadius: "var(--r2)", background: "var(--panel)", border: "1px solid var(--line)", fontSize: 12.5, lineHeight: 1.45, color: "var(--fg2)" }}>{m}</div>
          ))}
        </div>
      )}

      {info.skill && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="au-label">Skill ativa</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: "var(--r2)", background: "var(--accSoft)", fontFamily: "var(--fm)", fontSize: 12, color: "var(--fg)" }}>
            <Icon name="sparkles" size={13} color="var(--acc)" />
            {info.skill.name}
            <span style={{ marginLeft: "auto", color: "var(--fg3)" }}>{info.skill.version}</span>
          </div>
        </div>
      )}

      {info.subagents && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <span className="au-label">Subagentes</span>
          {info.subagents.map((a) => (
            <div key={a.name} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--fm)", fontSize: 11.5, color: "var(--fg2)" }}>
              <Icon name="circle-check" size={12} color="var(--ok)" />
              {a.name}
              <span style={{ marginLeft: "auto", color: "var(--fg3)" }}>{a.dur}</span>
            </div>
          ))}
          <button className="au-link" onClick={() => navigate("/agents")}>
            Ver todos →
          </button>
        </div>
      )}
    </aside>
  );
}
