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
/** Demais comandos do catálogo, só com a descrição em português (a ordem do menu segue PT_COMMANDS). */
const PT_MORE: [string, string][] = [
  ["/history", "Mostra o histórico desta conversa"],
  ["/save", "Exporta esta conversa para um arquivo"],
  ["/branch", "Cria uma conversa nova a partir deste ponto"],
  ["/worktree", "Lista, cria ou limpa cópias isoladas do repositório (git worktree)"],
  ["/rollback", "Lista ou restaura os pontos de restauração dos arquivos"],
  ["/snapshot", "Cria ou restaura um instantâneo da configuração do Hermes"],
  ["/pause", "Pausa todo trabalho novo (parada de emergência); /pause off retoma"],
  ["/approve", "Aprova um comando perigoso que está esperando"],
  ["/deny", "Nega um comando perigoso que está esperando"],
  ["/bg", "Roda um pedido numa conversa separada, em segundo plano"],
  ["/agents", "Mostra os agentes e tarefas em andamento"],
  ["/journey", "Abre a linha do tempo do que o Hermes aprendeu"],
  ["/heartbeat", "Repete um pedido de tempos em tempos quando a conversa fica parada"],
  ["/refine", "Revisa a conversa agora e guarda o que aprendeu na memória e nas skills"],
  ["/loop", "Repete um pedido a cada intervalo, nesta conversa"],
  ["/moa", "Responde um pedido com vários modelos juntos e volta ao seu modelo"],
  ["/subgoal", "Adiciona ou gerencia critérios extras do objetivo atual"],
  ["/whoami", "Mostra quais comandos você pode usar"],
  ["/profile", "Mostra o perfil ativo e a pasta dele"],
  ["/config", "Mostra a configuração atual"],
  ["/verbose", "Alterna quanto do trabalho das ferramentas aparece"],
  ["/focus", "Mostra só a sua pergunta e a resposta final"],
  ["/footer", "Liga ou desliga o rodapé com dados da resposta"],
  ["/approvals", "Mostra ou muda o modo de aprovação de comandos perigosos"],
  ["/indicator", "Escolhe o estilo do indicador de \"pensando\""],
  ["/busy", "Define o que acontece com mensagens enviadas enquanto o Hermes trabalha"],
  ["/toolsets", "Lista os conjuntos de ferramentas disponíveis"],
  ["/bundles", "Lista os pacotes de skills"],
  ["/init", "Cria ou atualiza o AGENTS.md do projeto a partir do código"],
  ["/cron", "Gerencia os agendamentos"],
  ["/suggestions", "Revisa automações sugeridas (aceitar ou dispensar)"],
  ["/blueprint", "Monta uma automação a partir de um modelo pronto"],
  ["/curator", "Manutenção de skills em segundo plano (status, executar, fixar, arquivar)"],
  ["/kanban", "Quadro de tarefas compartilhado entre perfis"],
  ["/reload", "Recarrega as variáveis do .env nesta conversa"],
  ["/reload-mcp", "Recarrega os servidores MCP da configuração"],
  ["/reload-skills", "Procura skills instaladas ou removidas"],
  ["/browser", "Conecta as ferramentas de navegador ao seu navegador aberto"],
  ["/plugins", "Lista os plugins instalados e o estado de cada um"],
  ["/restart", "Reinicia o gateway depois de terminar o que está rodando"],
  ["/platforms", "Mostra o estado das plataformas de mensagem"],
  ["/platform", "Pausa, retoma ou lista uma plataforma de mensagem com falha"],
  ["/copy", "Copia a última resposta para a área de transferência"],
  ["/paste", "Anexa a imagem da área de transferência"],
  ["/image", "Anexa um arquivo de imagem ao próximo pedido"],
  ["/update", "Atualiza o Hermes para a versão mais recente"],
];
const PT = new Map([...PT_MORE, ...PT_COMMANDS]);

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
