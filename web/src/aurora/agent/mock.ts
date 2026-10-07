// Dados mock das telas do agente — copiados do protótipo.
import { mockChat } from "../chat/mock";
import { parseCronPt } from "./cron";
import type { AgentAdapter, CronJob, Gateway, LogLine, MemoryEntry, Settings, Skill, SubagentDone } from "./types";

const MEMORY: MemoryEntry[] = [
  { id: "1", text: "Prefere squash merge e bloqueia PRs sem testes.", kind: "preferência", source: "sessão de 02 out", pinned: true },
  { id: "2", text: "Trabalha na Innovare; repositório principal: innovare-tech/hermes-agent.", kind: "contexto", source: "perfil", pinned: true },
  { id: "3", text: "Fuso horário America/Sao_Paulo. Respostas em português, curtas.", kind: "preferência", source: "onboarding", pinned: false },
  { id: "4", text: "Deploy de produção só às terças e quintas, depois das 14h.", kind: "regra", source: "sessão de 28 set", pinned: false },
  { id: "5", text: "Backups do Postgres vão para o bucket s3://innovare-bkp, retenção de 30 dias.", kind: "infra", source: "cron #2", pinned: false },
  { id: "6", text: "Não gosta de emojis em mensagens de commit.", kind: "preferência", source: "sessão de 19 set", pinned: false },
  { id: "7", text: "O e2e de login quebra quando o Playwright é atualizado sem atualizar os browsers.", kind: "aprendizado", source: "hoje, 09:52", pinned: false },
];

// Estado do mock: as mudanças feitas nas telas persistem durante a sessão.
let memory = structuredClone(MEMORY);

const PROFILE = [
  { k: "Papel", v: "Engenheiro, lidera produto e infraestrutura" },
  { k: "Estilo", v: "Direto, gosta de listas curtas e decisões claras" },
  { k: "Ferramentas", v: "GitHub, Linear, Postgres, Docker, Modal" },
  { k: "Rotina", v: "Revisões pela manhã, deploys à tarde" },
  { k: "Evitar", v: "Explicações longas, emojis, jargão de marketing" },
];

const SKILLS: Skill[] = [
  { name: "github-pr-review", origin: "aprendida", description: "Revisa PRs com checklist de testes, tipos e breaking changes; delega por PR.", uses: 38, version: "4", updated: "hoje" },
  { name: "pg-backup", origin: "aprendida", description: "Dump do Postgres, compressão, upload no S3 e verificação por checksum.", uses: 61, version: "3", updated: "ontem" },
  { name: "ai-news-briefing", origin: "sua", description: "Coleta e ranqueia as notícias de IA do dia em cinco destaques.", uses: 27, version: "2", updated: "seg" },
  { name: "web-research", origin: "hub", description: "Pesquisa em várias fontes com citações e resumo comparativo.", uses: 44, version: "7", updated: "set" },
  { name: "ci-migrate", origin: "aprendida", description: "Converte pipelines do Jenkins para GitHub Actions passo a passo.", uses: 5, version: "1", updated: "ontem" },
  { name: "expense-sheet", origin: "aprendida", description: "Lê extratos, categoriza transações e gera planilha mensal.", uses: 9, version: "2", updated: "dom" },
  { name: "arxiv-digest", origin: "hub", description: "Resume papers do arXiv com contribuições, método e limitações.", uses: 14, version: "5", updated: "ago" },
  { name: "release-notes", origin: "sua", description: "Gera notas de versão a partir de commits convencionais.", uses: 11, version: "3", updated: "set" },
  { name: "openclaw-migration", origin: "hub", description: "Migra memórias, skills e chaves de uma instalação OpenClaw.", uses: 1, version: "1", updated: "jul" },
];

export const DEST_ICON: Record<string, string> = { Telegram: "send", Email: "mail", Discord: "message-circle", WhatsApp: "phone", Slack: "hash", Conversa: "message-square" };

const CRONS: CronJob[] = [
  { id: "1", title: "Resumo semanal de PRs", human: "toda segunda, 09:00", expr: "0 9 * * 1", next: "seg 12 out, 09:00", dest: "Telegram", destIcon: "send", enabled: true },
  { id: "2", title: "Backup do Postgres", human: "todo dia, 03:00", expr: "0 3 * * *", next: "amanhã, 03:00", dest: "Email", destIcon: "mail", enabled: true },
  { id: "3", title: "Briefing de notícias de IA", human: "dias úteis, 07:30", expr: "30 7 * * 1-5", next: "amanhã, 07:30", dest: "Telegram", destIcon: "send", enabled: true },
  { id: "4", title: "Auditoria de dependências", human: "todo dia 1, 10:00", expr: "0 10 1 * *", next: "1 nov, 10:00", dest: "Discord", destIcon: "message-circle", enabled: true },
  { id: "5", title: "Lembrete de fechar o mês", human: "último dia útil, 17:00", expr: "0 17 L * *", next: "30 out, 17:00", dest: "WhatsApp", destIcon: "phone", enabled: false },
];

// Progresso simulado (como o tick de 1,1s do protótipo).
const AGENTS = [
  { id: "4", name: "sub-4 · audit-deps", task: "Auditar dependências com CVEs abertas em 6 repositórios", base: 22, rate: 3, backend: "docker", tools: 6, parent: "cron #4", now: ["npm audit --json > /tmp/a.json", "pip-audit -r requirements.txt", "lendo GHSA-8x2q-…", "comparando versões fixas", "escrevendo relatório.md"] },
  { id: "5", name: "sub-5 · research", task: "Comparar custos de hospedagem: Modal vs Daytona vs VPS", base: 48, rate: 2, backend: "modal", tools: 4, parent: "Telegram", now: ['web_search "modal pricing gpu 2026"', "abrindo daytona.io/pricing", "extraindo tabela", "calculando cenário 8h/dia"] },
  { id: "6", name: "sub-6 · ci", task: "Corrigir o e2e de login quebrado no PR #421", base: 8, rate: 5, backend: "ssh: build-01", tools: 8, parent: "sessão 7f3a", now: ["npx playwright install", "pnpm test:e2e login", "lendo trace.zip", "patch em auth.spec.ts", "rodando novamente"] },
];
const DONE: SubagentDone[] = [
  { task: "Revisar PR #412", name: "sub-1 · review", tokens: "6,2k tokens", dur: "3,1s" },
  { task: "Revisar PR #418", name: "sub-2 · review", tokens: "4,8k tokens", dur: "2,7s" },
  { task: "Revisar PR #421", name: "sub-3 · review", tokens: "7,9k tokens", dur: "3,8s" },
  { task: "Categorizar extrato de setembro", name: "sub-9 · finance", tokens: "21k tokens", dur: "41s" },
];
const started = Date.now();

const GATEWAYS: Gateway[] = [
  { id: "tg", name: "Telegram", mono: "T", account: "@hermes_casa_bot · home", enabled: true, status: "conectado", stat: "42 msgs hoje" },
  { id: "dc", name: "Discord", mono: "D", account: "servidor Innovare · #agente", enabled: true, status: "conectado", stat: "18 msgs hoje" },
  { id: "sl", name: "Slack", mono: "S", account: "não configurado", enabled: false, status: "desligado", stat: "" },
  { id: "wa", name: "WhatsApp", mono: "W", account: "+55 11 9••••-4410", enabled: true, status: "pareando", stat: "escaneie o QR" },
  { id: "sg", name: "Signal", mono: "Si", account: "não configurado", enabled: false, status: "desligado", stat: "" },
  { id: "em", name: "Email", mono: "@", account: "hermes@innovare.dev", enabled: true, status: "conectado", stat: "3 msgs hoje" },
];

const LOGPOOL: [LogLine["level"], string, string][] = [
  ["INFO", "gateway", "telegram ← mensagem de @home (128 chars)"],
  ["TOOL", "agent", "terminal: git status --short"],
  ["TOOL", "agent", 'web_search "playwright browsers install ci"'],
  ["INFO", "memory", "nudge: 1 fato candidato a persistir"],
  ["TOOL", "sub-6", "pnpm test:e2e login → 1 passed"],
  ["INFO", "cron", "job 3 agendado para 07:30"],
  ["WARN", "gateway", "discord: latência alta (840ms)"],
  ["TOOL", "sub-4", "pip-audit → 2 vulnerabilidades"],
  ["INFO", "skills", "github-pr-review v4 → v5 (auto-melhoria)"],
  ["ERRO", "sub-5", "timeout ao abrir daytona.io/pricing, tentando de novo"],
  ["INFO", "agent", "compressão de contexto: 41k → 18k tokens"],
];

const SETTINGS: Settings = {
  providers: [
    { id: "nous", name: "Nous Portal", description: "300+ modelos e ferramentas numa assinatura", models: ["hermes-4-405b", "hermes-4-70b", "kimi-k2", "deepseek-v3.2"] },
    { id: "or", name: "OpenRouter", description: "Qualquer modelo, cobrança por uso", models: ["anthropic/claude-sonnet", "openai/gpt-5", "google/gemini-2.5-pro"] },
    { id: "oa", name: "OpenAI", description: "Chave de API própria", models: ["gpt-5", "gpt-5-mini"] },
    { id: "an", name: "Anthropic", description: "Chave de API própria", models: ["claude-sonnet", "claude-opus"] },
    { id: "local", name: "Endpoint próprio", description: "vLLM, Ollama, llama.cpp…", models: ["localhost:8000/v1"] },
  ],
  provider: "nous",
  model: "hermes-4-405b",
  backends: [
    { id: "local", name: "Local", description: "Na sua máquina" },
    { id: "docker", name: "Docker", description: "Contêiner isolado" },
    { id: "ssh", name: "SSH", description: "Servidor remoto" },
    { id: "sing", name: "Singularity", description: "Clusters HPC" },
    { id: "modal", name: "Modal", description: "Serverless, hiberna" },
    { id: "day", name: "Daytona", description: "Serverless, persistente" },
    { id: "vercel", name: "Vercel Sandbox", description: "Efêmero" },
  ],
  backend: "docker",
  personas: ["Direto", "Didático", "Técnico", "Criativo", "Conciso"],
  persona: "Direto",
  tools: [
    { id: "term", name: "Terminal", description: "Executa comandos no backend escolhido", icon: "square-terminal", enabled: true },
    { id: "web", name: "Busca na web", description: "Pesquisa e leitura de páginas", icon: "globe", enabled: true },
    { id: "br", name: "Navegador", description: "Automação de browser na nuvem", icon: "app-window", enabled: true },
    { id: "vis", name: "Visão", description: "Entende imagens e capturas", icon: "eye", enabled: true },
    { id: "img", name: "Geração de imagem", description: "Via Tool Gateway", icon: "image", enabled: false },
    { id: "tts", name: "Voz (TTS)", description: "Respostas em áudio nos mensageiros", icon: "audio-lines", enabled: false },
    { id: "del", name: "Subagentes", description: "Delegação e paralelismo", icon: "git-fork", enabled: true },
    { id: "mcp", name: "Servidores MCP", description: "2 conectados", icon: "plug", enabled: true },
  ],
};

const now = () => new Date().toTimeString().slice(0, 8);
const logs: LogLine[] = Array.from({ length: 14 }, (_, i) => {
  const p = LOGPOOL[i % LOGPOOL.length];
  return { id: String(i), t: `09:${String(38 + Math.floor(i / 3)).padStart(2, "0")}:${String((i * 7) % 60).padStart(2, "0")}`, level: p[0], src: p[1], msg: p[2] };
});

export const mockAgent: AgentAdapter = {
  async sessions(query, source) {
    const q = query.toLowerCase();
    return (await mockChat.sessions())
      .filter((s) => (source === "Todas" || s.source === source) && (!q || (s.title + s.snippet).toLowerCase().includes(q)))
      .map((s) => ({ id: s.id, title: s.title, source: s.source, icon: s.icon, snippet: s.snippet, msgs: s.msgs, when: s.when }));
  },
  memory: async () => ({ entries: structuredClone(memory), profile: PROFILE, note: "Modelagem dialética via Honcho ativa. O perfil se atualiza ao fim de cada sessão." }),
  setMemory: async (entries) => {
    memory = structuredClone(entries);
  },
  skills: async () => structuredClone(SKILLS),
  crons: async () => structuredClone(CRONS),
  toggleCron: async (c) => {
    const j = CRONS.find((x) => x.id === c.id);
    if (j) j.enabled = !j.enabled;
  },
  previewCron: parseCronPt,
  async createCron(text) {
    const p = parseCronPt(text);
    if (!p) throw new Error("Não entendi quando rodar — diga, por exemplo, “toda sexta às 18h”.");
    const job = { id: String(Date.now()), title: p.prompt.slice(0, 60), human: p.human, expr: p.expr, next: "em breve", dest: p.dest, destIcon: DEST_ICON[p.dest] ?? "message-square", enabled: true };
    CRONS.unshift(job);
    return structuredClone(job);
  },
  async subagents() {
    const tick = Math.floor((Date.now() - started) / 1100);
    return {
      running: AGENTS.map((a, i) => {
        const secs = a.base * 3 + tick;
        return { id: a.id, name: a.name, task: a.task, pct: Math.min(97, (a.base + tick * a.rate) % 100), now: a.now[Math.floor(tick / 3 + i) % a.now.length], elapsed: `${Math.floor(secs / 60)}m ${String(secs % 60).padStart(2, "0")}s`, backend: a.backend, tools: a.tools, parent: a.parent };
      }),
      done: DONE,
    };
  },
  gateways: async () => ({ summary: { running: true, label: "gateway ativo · pid 48211 · 3d 4h" }, items: structuredClone(GATEWAYS) }),
  toggleGateway: async (g) => {
    const x = GATEWAYS.find((y) => y.id === g.id);
    if (x) {
      x.enabled = !x.enabled;
      x.status = x.enabled ? (x.status === "desligado" ? "pareando" : x.status) : "desligado";
    }
  },
  async logs() {
    // Uma linha nova a cada chamada (~2,2s), como o stream do protótipo.
    const p = LOGPOOL[logs.length % LOGPOOL.length];
    logs.push({ id: String(logs.length), t: now(), level: p[0], src: p[1], msg: p[2] });
    return [...logs];
  },
  settings: async () => structuredClone(SETTINGS),
  saveSettings: async ({ tool, ...rest }) => {
    Object.assign(SETTINGS, rest);
    if (tool) SETTINGS.tools = SETTINGS.tools.map((t) => (t.id === tool.id ? { ...t, enabled: tool.enabled } : t));
  },
};
