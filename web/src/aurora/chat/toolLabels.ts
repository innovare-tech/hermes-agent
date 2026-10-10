// Nomes de ferramenta do agente em português + resumo curto dos argumentos.

/** [enquanto roda, depois de pronto]. */
const LABELS: Record<string, [string, string]> = {
  terminal: ["Executando comando no terminal", "Comando no terminal"],
  process_manage: ["Gerenciando processo", "Processo gerenciado"],
  close_terminal: ["Fechando terminal", "Terminal fechado"],
  read_terminal: ["Lendo o terminal", "Terminal lido"],
  execute_code: ["Executando código", "Código executado"],
  search_files: ["Buscando arquivos", "Busca de arquivos"],
  read_file: ["Lendo arquivo", "Arquivo lido"],
  write_file: ["Escrevendo arquivo", "Arquivo escrito"],
  patch: ["Editando arquivo", "Arquivo editado"],
  web_search: ["Pesquisando na web", "Pesquisa na web"],
  web_extract: ["Lendo página da web", "Página lida"],
  x_search: ["Pesquisando no X", "Pesquisa no X"],
  vision_analyze: ["Analisando imagem", "Imagem analisada"],
  video_analyze: ["Analisando vídeo", "Vídeo analisado"],
  image_generate: ["Gerando imagem", "Imagem gerada"],
  video_generate: ["Gerando vídeo", "Vídeo gerado"],
  text_to_speech: ["Gerando áudio", "Áudio gerado"],
  memory: ["Consultando a memória", "Memória"],
  session_search: ["Buscando em conversas antigas", "Busca em conversas"],
  skill_view: ["Lendo skill", "Skill lida"],
  skills_list: ["Listando skills", "Skills listadas"],
  skill_manage: ["Gerenciando skill", "Skill gerenciada"],
  cronjob_manage: ["Gerenciando agendamento", "Agendamento"],
  cronjob: ["Gerenciando agendamento", "Agendamento"],
  delegate_task: ["Delegando a um subagente", "Subagente"],
  todo_list: ["Atualizando a lista de tarefas", "Lista de tarefas"],
  todo: ["Atualizando a lista de tarefas", "Lista de tarefas"],
  clarify: ["Perguntando a você", "Pergunta"],
  send_message: ["Enviando mensagem", "Mensagem enviada"],
  computer_use: ["Usando o computador", "Computador usado"],
  tool_describe: ["Consultando detalhes da ferramenta", "Detalhes da ferramenta consultados"],
};

/** Ferramentas MCP do Copiloto (servidor `aibiz_ops`): uma só frase, rodando ou pronta. */
const AIBIZ_OPS: Record<string, string> = {
  my_channels_status: "Status dos canais",
  channel_metrics: "Métricas dos canais",
  search_conversations: "Buscar conversas",
  timeline: "Linha do tempo do atendimento",
  trace_routing: "Rastrear roteamento",
  audit_operator: "Atividade do atendente",
  dead_letters: "Mensagens que não entraram",
  describe_domain: "Descrever dados disponíveis",
  query: "Consulta",
  aggregate: "Análise de dados",
};

const BROWSER = /^browser_/;

/** "foo_bar" → "Foo bar" (ferramentas que não conhecemos). */
const humanize = (n: string) => {
  const t = n.replace(/^mcp_/, "").replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "Ferramenta";
};

/** `mcp__servidor__ferramenta` (o servidor pode ter `_`): [servidor, ferramenta]. O `mcp_servidor_ferramenta` antigo cai no humanize. */
const MCP = /^mcp__(.+?)__(.+)$/;
const AIBIZ_OPS_NAME = /^mcp_{1,2}aibiz_ops_{1,2}(.+)$/;

export function toolLabel(name: string, running = false): string {
  const l = LABELS[name];
  if (l) return l[running ? 0 : 1];
  const ops = AIBIZ_OPS_NAME.exec(name);
  if (ops && AIBIZ_OPS[ops[1]]) return AIBIZ_OPS[ops[1]];
  const mcp = MCP.exec(name);
  if (mcp) return `${humanize(mcp[2])} (via ${mcp[1].replace(/_+/g, " ")})`;
  if (BROWSER.test(name)) return running ? "Usando o navegador" : "Navegador";
  return humanize(name);
}

const squash = (s: string, max: number) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
};

/** Caminho longo → só o final ("…/web/src/App.tsx"). */
const tail = (p: string) => (p.length > 56 ? "…" + p.slice(-55) : p);

const first = (a: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) {
    const v = a[k];
    if (typeof v === "string" && v.trim()) return v;
    if (Array.isArray(v) && typeof v[0] === "string") return v[0] as string;
  }
  return "";
};

/** Resumo de uma linha dos argumentos: o que a ferramenta está fazendo agora. */
export function summarizeArgs(name: string, args?: Record<string, unknown> | null): string {
  if (!args || typeof args !== "object") return "";
  const a = args;
  switch (name) {
    case "terminal":
      return squash(first(a, "command", "cmd"), 120);
    case "execute_code":
      return squash(first(a, "code", "script"), 100);
    case "search_files": {
      const pat = first(a, "pattern", "query");
      const where = first(a, "path");
      const what = !pat || pat === "*" ? "todos os arquivos" : a.target === "files" ? `arquivos com ${pat}` : `texto “${pat}”`;
      return squash(`${what} ${!where || where === "." || where === "./" ? "na pasta atual" : "em " + tail(where)}`, 120);
    }
    case "read_file":
    case "write_file":
    case "patch":
      return tail(first(a, "path", "file_path", "filename"));
    case "web_search":
    case "x_search":
      return squash(first(a, "query", "q"), 100);
    case "web_extract":
      return squash(first(a, "urls", "url"), 100);
    case "delegate_task":
      return squash(first(a, "goal", "task", "prompt"), 100);
    default: {
      const v = Object.values(a).find((x) => typeof x === "string" && (x as string).trim());
      return typeof v === "string" ? squash(v, 100) : "";
    }
  }
}

/** 1,2s / 14s / 1min 05s — tempo correndo ou final. */
export function fmtElapsed(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return s.toFixed(1).replace(".", ",") + "s";
  if (s < 60) return Math.round(s) + "s";
  return `${Math.floor(s / 60)}min ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/** Saída longa: corta em N linhas / M caracteres; `all` mostra tudo. */
export function limitOutput(text: string, all = false, maxLines = 40, maxChars = 3000): { text: string; cut: boolean } {
  if (all) return { text, cut: false };
  const lines = text.split("\n");
  if (lines.length <= maxLines && text.length <= maxChars) return { text, cut: false };
  return { text: lines.slice(0, maxLines).join("\n").slice(0, maxChars), cut: true };
}

/** Código ou comando completo, com as quebras de linha, para o bloco mono do passo expandido. */
export function argBlock(name: string, args?: Record<string, unknown> | null): string {
  if (!args || typeof args !== "object") return "";
  const v = name === "terminal" ? first(args, "command", "cmd") : name === "execute_code" ? first(args, "code", "script") : "";
  return v.trim();
}
