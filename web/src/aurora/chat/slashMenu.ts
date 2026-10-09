// Menu "/" montado a partir do `commands.catalog` do gateway: Comandos e Skills, com busca.
import type { CommandsCatalogResult } from "@hermes/shared";
import type { SlashCommand } from "./types";

/** Principais comandos, na ordem em que aparecem, com descrição em português. */
export const PT_COMMANDS: [string, string][] = [
  ["/retry", "Gera a última resposta de novo"],
  ["/undo", "Volta uma pergunta e devolve o texto ao campo"],
  ["/title", "Dá um título a esta conversa — /title Nome"],
  ["/compress", "Resume o começo da conversa para liberar contexto"],
  ["/model", "Troca o modelo desta conversa — /model nome"],
  ["/reasoning", "Esforço de raciocínio — /reasoning high"],
  ["/fast", "Modo rápido do provedor (quando o modelo tem)"],
  ["/status", "Mostra modelo, tokens e estado desta conversa"],
  ["/usage", "Consumo de tokens e limites"],
  ["/context", "O que ocupa a janela de contexto"],
  ["/btw", "Pergunta paralela, sem interromper a tarefa em andamento"],
  ["/steer", "Corrige o rumo da tarefa em andamento, sem parar"],
  ["/queue", "Deixa um pedido na fila para o próximo turno"],
  ["/goal", "Define um objetivo que o Hermes persegue até cumprir"],
  ["/plan", "Escreve um plano de implementação sem executar nada"],
  ["/review", "Um subagente revisa o trabalho que acabou de ser feito"],
  ["/learn", "Ensina uma skill nova a partir do que você descrever"],
  ["/memory", "Revisa o que o Hermes quer guardar na memória"],
  ["/personality", "Troca a personalidade das respostas"],
  ["/insights", "Resumo e estatísticas do seu uso"],
  ["/stop", "Encerra processos que o agente deixou rodando em segundo plano"],
  ["/tools", "Lista ou liga/desliga ferramentas do agente"],
  ["/skills", "Busca, instala ou gerencia skills"],
  ["/diff", "Mostra as mudanças do git na pasta de trabalho"],
  ["/help", "Lista os comandos"],
  ["/version", "Versão do Hermes"],
];
const PT = new Map(PT_COMMANDS);

/** Comandos de terminal / de conta / de instalação que não fazem sentido no painel. */
const HIDE = new Set([
  "/new", "/reset", "/start", "/topic", "/prompt", "/compose", "/yolo", "/palette", "/skin", "/voice", "/wake", "/battery", "/timestamps", "/ts", "/pet", "/hatch", "/generate-pet", "/login", "/topup", "/subscription", "/upgrade", "/debug", "/density", "/mouse", "/egress", "/codex-runtime", "/codex_runtime", "/sessions", "/resume", "/clear", "/redraw", "/quit", "/exit", "/statusbar", "/sb", "/handoff", "/export", "/import", "/sethome", "/set-home", "/logs", "/commands",
]);
const HIDE_DESKTOP = new Set(["terminal", "messaging", "composer-voice", "settings"]);

const clean = (d: string) => d.replace(/\s*\((?:usage|alias for)[^)]*\)\s*$/i, "").replace(/\s*\(usage:[\s\S]*$/i, "").trim();
const norm = (c: string) => (c.startsWith("/") ? c : "/" + c);

export function buildSlashMenu(r: Pick<CommandsCatalogResult, "pairs" | "skills" | "commands">): SlashCommand[] {
  const skillKeys = new Set(Object.keys(r.skills ?? {}).map(norm));
  const usage = (c: string) => (r.skills ?? {})[c]?.usage ?? 0;
  const order = new Map(PT_COMMANDS.map(([c], i) => [c, i]));
  const cmds: SlashCommand[] = [];
  const skills: SlashCommand[] = [];
  const seen = new Set<string>();
  for (const [raw, desc] of r.pairs ?? []) {
    const cmd = norm(raw);
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    if (skillKeys.has(cmd)) {
      skills.push({ cmd, desc: clean(desc ?? ""), skill: true, group: "Skills" });
      continue;
    }
    const d = r.commands?.[raw]?.desktop ?? r.commands?.[cmd]?.desktop;
    if (HIDE.has(cmd) || (d && HIDE_DESKTOP.has(d)) || (d === "hidden" && cmd !== "/model")) continue;
    cmds.push({ cmd, desc: PT.get(cmd) ?? clean(desc ?? ""), group: "Comandos" });
  }
  // Conhecidos primeiro (na ordem acima), o resto em ordem alfabética.
  cmds.sort((a, b) => (order.get(a.cmd) ?? 999) - (order.get(b.cmd) ?? 999) || a.cmd.localeCompare(b.cmd));
  skills.sort((a, b) => usage(b.cmd) - usage(a.cmd) || a.cmd.localeCompare(b.cmd));
  return [...cmds, ...skills];
}

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Filtra pelo que foi digitado depois da "/": nome primeiro, depois descrição. Vazio = tudo. */
export function filterSlash(cmds: SlashCommand[], draft: string): SlashCommand[] {
  const q = fold(draft.replace(/^\//, "").trim());
  if (!q) return cmds;
  const rank = (c: SlashCommand) => {
    const name = fold(c.cmd.slice(1));
    return name.startsWith(q) ? 0 : name.includes(q) ? 1 : q.length >= 3 && fold(c.desc).includes(q) ? 2 : -1;
  };
  return cmds
    .map((c, i) => [c, rank(c), i] as const)
    .filter(([, r]) => r >= 0)
    // Comandos antes de Skills (cada grupo com o cabeçalho uma vez); dentro do grupo, melhor casamento primeiro.
    .sort((a, b) => Number(!!a[0].skill) - Number(!!b[0].skill) || a[1] - b[1] || a[2] - b[2])
    .map(([c]) => c);
}
