// Conversa simulada — mesmos passos, textos e tempos do protótipo.
import type { Session } from "../adapter";
import type { ChatAdapter, ChatEvent, ChatMessage, SessionInfo, SlashCommand, ToolStep } from "./types";

const SESSIONS: Session[] = [
  { id: "n0", title: "Nova conversa", source: "Web", icon: "globe", when: "agora", group: "Hoje", msgs: 0, snippet: "" },
  { id: "s1", title: "Revisão de PRs + resumo semanal", source: "Web", icon: "globe", when: "09:38", group: "Hoje", msgs: 14, snippet: "Agendei o resumo para toda segunda às 9h no Telegram." },
  { id: "s2", title: "Backup noturno do Postgres no S3", source: "Cron", icon: "calendar-clock", when: "03:00", group: "Hoje", msgs: 6, snippet: "Backup concluído: 2,3 GB, checksum verificado." },
  { id: "s3", title: "Nomes para o app de finanças", source: "Telegram", icon: "send", when: "08:12", group: "Hoje", msgs: 22, snippet: "Gostei de “Caixa Alta” e “Fôlego”." },
  { id: "s4", title: "Migrar CI do Jenkins para Actions", source: "CLI", icon: "square-terminal", when: "ontem", group: "Ontem", msgs: 41, snippet: "Workflow de deploy passou nos 3 ambientes." },
  { id: "s5", title: "Resumo do paper sobre DPO", source: "Discord", icon: "message-circle", when: "ontem", group: "Ontem", msgs: 9, snippet: "A contribuição central é trocar o modelo de recompensa por…" },
  { id: "s6", title: "Configurar sandbox no Modal", source: "CLI", icon: "square-terminal", when: "seg", group: "Esta semana", msgs: 17, snippet: "O ambiente hiberna após 10 min ocioso." },
  { id: "s7", title: "Briefing diário de IA", source: "Cron", icon: "calendar-clock", when: "seg", group: "Esta semana", msgs: 3, snippet: "Cinco destaques de hoje, em ordem de relevância." },
  { id: "s8", title: "Planilha de gastos de setembro", source: "WhatsApp", icon: "phone", when: "dom", group: "Esta semana", msgs: 12, snippet: "Categorizei 84 transações; mercado subiu 18%." },
];

const SEED: ChatMessage[] = [
  { id: "s1u", role: "user", text: "Revisa os PRs abertos do innovare-tech/hermes-agent, me diz quais estão prontos pra merge e agenda um resumo toda segunda às 9h no Telegram." },
  {
    id: "s1a",
    role: "agent",
    live: false,
    steps: [
      { id: "a", kind: "skill", name: "skill", target: "carregou /github-pr-review", dur: "0,2s", status: "ok", output: "skills/github-pr-review/SKILL.md (v4)\n→ checklist: testes, tipos, breaking changes, descrição" },
      { id: "b", kind: "terminal", name: "terminal", target: "gh pr list --state open --json number,title,checks", dur: "1,8s", status: "ok", output: "#412  feat(web): streaming de tool calls      ✓ checks\n#418  fix(gateway): reconexão do Discord      ✓ checks\n#421  chore: atualizar dependências           ✗ 2 falhas\n#423  feat(cron): fuso horário por tarefa     … rodando" },
      { id: "c", kind: "delegate", name: "delegate_task", target: "3 subagentes revisando #412, #418, #421", dur: "9,6s", status: "ok", output: "sub-1 #412 → aprovado, 1 sugestão de nome\nsub-2 #418 → aprovado\nsub-3 #421 → bloqueado: lockfile divergente, teste e2e quebrado" },
      { id: "d", kind: "memory", name: "memory.read", target: "preferências de revisão", dur: "0,1s", status: "ok", output: "“Prefere squash merge. Bloquear PR sem testes. Resumos curtos, em português.”" },
      { id: "e", kind: "cron", name: "cron.create", target: '"0 9 * * 1" → telegram:home', dur: "0,3s", status: "ok", output: "job 7 criado · próxima execução: seg 12 out 09:00 (America/Sao_Paulo)" },
    ],
    text: "Dois PRs estão prontos para merge e um precisa de atenção. O #423 ainda está com os checks rodando — incluo no resumo de segunda.",
    blocks: [
      {
        kind: "prs",
        items: [
          { n: 412, title: "feat(web): streaming de tool calls", note: "Pronto. Sugeri renomear useToolStream → useToolTimeline.", tag: "merge", tone: "ok" },
          { n: 418, title: "fix(gateway): reconexão do Discord", note: "Pronto. Cobre o caso de token expirado com teste.", tag: "merge", tone: "ok" },
          { n: 421, title: "chore: atualizar dependências", note: "Lockfile divergente e e2e de login quebrado após bump do Playwright.", tag: "bloqueado", tone: "err" },
          { n: 423, title: "feat(cron): fuso horário por tarefa", note: "Checks ainda rodando.", tag: "aguardando", tone: "warn" },
        ],
      },
      { kind: "cron", title: "Resumo semanal de PRs", detail: "toda segunda, 09:00 → Telegram · próxima seg 12 out" },
    ],
    meta: "hermes-4-405b · 18,4k tokens · $0,04 · 12,0s",
    learned: "+1 memória",
  },
];

export const SLASH: SlashCommand[] = [
  { cmd: "/new", desc: "Nova conversa" },
  { cmd: "/model", desc: "Trocar modelo" },
  { cmd: "/personality", desc: "Mudar personalidade" },
  { cmd: "/compress", desc: "Comprimir o contexto" },
  { cmd: "/usage", desc: "Uso de tokens e custo" },
  { cmd: "/skills", desc: "Listar skills" },
  { cmd: "/retry", desc: "Refazer a última resposta" },
];

const REPLY =
  "Feito. Cruzei o pedido com o que já sei de você e com o estado atual do repositório. Nada bloqueante por aqui — sigo com isso e aviso no Telegram quando terminar. Se quiser, transformo em um agendamento recorrente.";

// Mesma conta fake do protótipo: contexto e custo crescem com o número de mensagens.
const info = (n: number): SessionInfo => ({
  model: "hermes-4-405b",
  backend: "docker",
  persona: "direto",
  ctxUsed: (n * 2.6 + 12) * 1000,
  ctxMax: 128000,
  cost: (4 + n) / 100,
  memories: ["Prefere squash merge e bloqueia PRs sem testes.", "Respostas em português, curtas.", "Repositório principal: innovare-tech/hermes-agent."],
  skill: { name: "/github-pr-review", version: "v4" },
  subagents: [
    { name: "sub-1 · #412", dur: "3,1s" },
    { name: "sub-2 · #418", dur: "2,7s" },
    { name: "sub-3 · #421", dur: "3,8s" },
  ],
});

const counts = new Map<string, number>();
const timers = new Map<string, ReturnType<typeof setTimeout>[]>();
const finish = new Map<string, () => void>();

export const mockChat: ChatAdapter = {
  async sessions() {
    return structuredClone(SESSIONS);
  },

  async create() {
    return "n" + Date.now();
  },

  async history(sessionId) {
    const s = SESSIONS.find((x) => x.id === sessionId && x.msgs > 0);
    const messages: ChatMessage[] =
      sessionId === "s1"
        ? structuredClone(SEED)
        : s
          ? [
              { id: s.id + "u", role: "user", text: s.title },
              { id: s.id + "a", role: "agent", steps: [], text: s.snippet, live: false, meta: `histórico · ${s.msgs} mensagens · via ${s.source}` },
            ]
          : [];
    if (sessionId) counts.set(sessionId, messages.length);
    return { messages, info: info(messages.length) };
  },

  send(sessionId, text, on) {
    const steps: ToolStep[] = [
      { id: "x1", kind: "memory", name: "memory.search", target: `"${text.slice(0, 42)}"`, dur: "0,2s", status: "run", output: "3 memórias relevantes · 2 sessões relacionadas (FTS)" },
      { id: "x2", kind: "terminal", name: "terminal", target: "git -C ~/innovare/hermes-agent log --since=7.days --oneline", dur: "1,1s", status: "run", output: "a91f3c2 feat(web): timeline de ferramentas\n77be010 fix(gateway): reconexão\n3c0d9e1 chore(deps): bump playwright" },
      { id: "x3", kind: "web", name: "web_search", target: "contexto adicional", dur: "2,4s", status: "run", output: "5 resultados · 2 lidos" },
    ];
    return new Promise<void>((resolve) => {
      const list: ReturnType<typeof setTimeout>[] = [];
      const later = (ms: number, f: () => void) => list.push(setTimeout(f, ms));
      const emit = (e: ChatEvent) => on(e);
      let at = 500;
      steps.forEach((st, i) => {
        later(at, () => emit({ type: "step", step: st }));
        at += 900 + i * 500;
        later(at, () => emit({ type: "step", step: { ...st, status: "ok" } }));
        at += 150;
      });
      const words = REPLY.split(" ");
      words.forEach((w, i) => later(at + i * 45, () => emit({ type: "delta", text: (i ? " " : "") + w })));
      later(at + words.length * 45 + 100, () => {
        const n = (counts.get(sessionId) ?? 0) + 2;
        counts.set(sessionId, n);
        emit({ type: "done", meta: "hermes-4-405b · 6,1k tokens · $0,01 · 4,9s", learned: "+1 memória", info: info(n) });
        timers.delete(sessionId);
        resolve();
      });
      timers.set(sessionId, list);
      finish.set(sessionId, resolve);
    });
  },

  async interrupt(sessionId) {
    timers.get(sessionId)?.forEach(clearTimeout);
    timers.delete(sessionId);
    finish.get(sessionId)?.();
  },

  async slashCommands() {
    return SLASH;
  },
};
