// Saída das ferramentas (JSON do backend) → resumo em português. O JSON/texto original continua no "detalhe".
import type { ToolSummary } from "./types";

const str = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
const num = (n: number) => n.toLocaleString("pt-BR");
const count = (n: number, one: string, many: string) => `${num(n)} ${n === 1 ? one : many}`;
const MAX_MORE = 20000;

function parse(raw: unknown): Record<string, unknown> | null {
  let v = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** O usuário negou a aprovação: o backend devolve "BLOCKED: User denied …" no lugar do resultado. */
export const toolDenied = (raw: unknown) => /BLOCKED:[^\n]*\bdenied\b|\bUser denied\b|denied by (?:the )?user|was denied by the user/i.test(str(raw));

/** Escrita/ação que parou esperando alguém aprovar (ainda NÃO rodou): `pending_approval`/`approval_required` do approval.py ou "Pedi aprovação no Telegram (pedido #N)" do guardrails. */
export const toolPending = (raw: unknown) =>
  /"status"\s*:\s*"(?:pending_approval|approval_required)"|"approval_pending"\s*:\s*true|Asking the user for approval|Pedi aprova(?:ç|\\u00e7)(?:ã|\\u00e3)o/i.test(str(raw));

const item = (x: unknown) => (typeof x === "string" ? x : x && typeof x === "object" ? str((x as { path?: unknown }).path ?? (x as { url?: unknown }).url ?? x) : str(x));

const HEAD_LINES = 5;
/** Código de saída que aparece escrito na saída em texto ("exit code: 2", "exited with code 1", "código de saída 3"); vale o último. */
const EXIT_CODE = /\b(?:exit[_ ]?code|exit status|exited with(?: code| status)?|returned(?: exit code)?|código de saída)[\s:="']*(-?\d+)/gi;

/** Terminal que devolveu texto puro (não JSON): primeiras linhas à vista, o resto recolhido, e como terminou quando o código aparece. */
function terminalText(raw: string): ToolSummary | undefined {
  const text = raw.trim();
  if (!text) return undefined;
  const lines = text.split("\n");
  const code = [...text.matchAll(EXIT_CODE)].at(-1)?.[1];
  const line = code == null ? count(lines.length, "linha de saída", "linhas de saída") : Number(code) === 0 ? "Terminou sem erro" : `Terminou com erro (código ${code})`;
  if (lines.length <= HEAD_LINES) return { line, head: text };
  return { line, head: lines.slice(0, HEAD_LINES).join("\n"), more: text.slice(0, MAX_MORE), moreLabel: `Ver a saída completa (${num(lines.length)} linhas)` };
}

export function summarizeOutput(name: string, raw: unknown): ToolSummary | undefined {
  const o = parse(raw);
  if (!o && name === "terminal" && typeof raw === "string") return terminalText(raw);
  if (!o || o.error) return undefined;
  switch (name) {
    case "search_files": {
      if (Array.isArray(o.files)) {
        const n = typeof o.total_count === "number" ? o.total_count : o.files.length;
        const shown = o.files.length < n ? ` (mostrando ${num(o.files.length)})` : "";
        return { line: n === 0 ? "Nenhum arquivo encontrado" : count(n, "arquivo encontrado", "arquivos encontrados") + shown, more: o.files.map(item).join("\n").slice(0, MAX_MORE) || undefined, moreLabel: `Ver a lista (${num(o.files.length)})` };
      }
      if (Array.isArray(o.matches)) {
        const n = typeof o.total_count === "number" ? o.total_count : o.matches.length;
        const rows = o.matches.map((m) => {
          const r = m as { path?: unknown; line?: unknown; content?: unknown };
          return typeof m === "string" ? m : `${str(r.path)}${r.line != null ? ":" + str(r.line) : ""}  ${str(r.content).trim()}`;
        });
        return { line: n === 0 ? "Nenhuma ocorrência encontrada" : count(n, "ocorrência encontrada", "ocorrências encontradas"), more: rows.join("\n").slice(0, MAX_MORE) || undefined, moreLabel: `Ver as ocorrências (${num(rows.length)})` };
      }
      return undefined;
    }
    case "read_file": {
      if (typeof o.content !== "string") return undefined;
      const n = typeof o.total_lines === "number" ? o.total_lines : o.content.split("\n").length;
      return { line: `Leu ${count(n, "linha", "linhas")}${o.truncated ? " (só uma parte)" : ""}`, more: o.content.slice(0, MAX_MORE), moreLabel: "Ver o conteúdo" };
    }
    case "terminal": {
      if (typeof o.output !== "string") return undefined;
      const code = typeof o.exit_code === "number" ? o.exit_code : 0;
      return { line: code === 0 ? "Terminou sem erro" : `Terminou com erro (código ${code})` };
    }
    case "web_search": {
      const data = o.data as { web?: unknown } | undefined;
      const list = Array.isArray(data?.web) ? data.web : Array.isArray(o.results) ? o.results : null;
      if (!list) return undefined;
      const rows = list.map((x) => {
        const r = x as { title?: unknown; url?: unknown };
        return typeof x === "string" ? x : `${str(r.title)}${r.url ? " — " + str(r.url) : ""}`;
      });
      return { line: rows.length === 0 ? "Nenhum resultado" : count(rows.length, "resultado", "resultados"), more: rows.join("\n").slice(0, MAX_MORE) || undefined, moreLabel: `Ver os resultados (${num(rows.length)})` };
    }
  }
  return undefined;
}
