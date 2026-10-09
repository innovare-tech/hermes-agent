// Modelos (design A5): contrato com /api/providers, /api/models/routing, /api/usage/spend e /api/limits,
// tipos e funções puras da tela (herança, custo, efeitos da remoção, limites).
import { fetchJSON } from "@/lib/api";

export type Cap = "text" | "vision" | "audio" | "decision";
export type ModelEntry = {
  id: string;
  caps: Cap[];
  /** Falso quando o catálogo não conhece o modelo: passa em texto e visão, mas não em áudio nem decisão. */
  capsKnown: boolean;
  /** US$ por milhão de tokens. */
  priceIn: number | null;
  priceOut: number | null;
  /** US$ por minuto de áudio. */
  pricePerMin: number | null;
  context: number | null;
  latency?: string;
};
export type ProviderKind = "openai" | "decision" | "builtin";
export type ProviderError = { code: "unauthorized" | "unreachable" | "no_models" | null; message: string | null; since: number | null };
export type Provider = {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  /** Só os provedores próprios e o Jev se editam aqui; os nativos têm a chave em Chaves de API. */
  editable: boolean;
  keyHint: string;
  status: "ok" | "error";
  error: ProviderError | null;
  checkedAt: number | null;
  models: ModelEntry[];
};

export type TestResult =
  | { ok: true; latencyMs: number; models: string[] }
  | { ok: false; code: "unauthorized" | "unreachable" | "no_models"; message: string };

export type TaskId =
  | "default" | "main" | "channel.telegram" | "channel.whatsapp" | "channel.api" | "group_analysis"
  | "triage_jev" | "vision" | "transcription" | "compaction" | "scheduled";
export type ModelPick = { provider: string; model: string };
/** `provider` vazio = sem modelo (só acontece na triagem desligada). */
export type RoutingValue = { inherit: true } | (ModelPick & { minConfidence?: number });
export type TaskMeta = { unit: string; tokensIn: number | null; tokensOut: number | null; measured: boolean };
export type Routing = { default: ModelPick | null; tasks: Record<Exclude<TaskId, "default">, RoutingValue>; taskMeta: Record<TaskId, TaskMeta> };

export type Spend = { today: number; month: number; dayOfMonth: number; daysInMonth: number };
export type OnLimit = "notify" | "pause_non_urgent" | "pause_profile";
export type Limits = { dailyUsd: number; monthlyUsd: number; alertPct: number; onLimit: OnLimit; saved?: boolean };

// ---- chamadas ----

const j = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const pid = (id: string) => encodeURIComponent(id);

export const modelsApi = {
  providers: () => fetchJSON<Provider[]>("/api/providers"),
  test: (baseUrl: string, apiKey: string, kind: "openai" | "decision" = "openai") => fetchJSON<TestResult>("/api/providers/test", j("POST", { baseUrl, apiKey, kind })),
  create: (name: string, baseUrl: string, apiKey: string, kind: "openai" | "decision") => fetchJSON<Provider>("/api/providers", j("POST", { name, baseUrl, apiKey, kind })),
  update: (id: string, patch: { name?: string; baseUrl?: string; apiKey?: string }) => fetchJSON<Provider>(`/api/providers/${pid(id)}`, j("PATCH", patch)),
  remove: (id: string) => fetchJSON<{ ok: boolean; affected: string[] }>(`/api/providers/${pid(id)}`, j("DELETE")),
  testSaved: (id: string) => fetchJSON<TestResult>(`/api/providers/${pid(id)}/test`, j("POST")),
  routing: () => fetchJSON<Routing>("/api/models/routing"),
  saveRouting: (body: { default?: ModelPick; tasks: Record<string, RoutingValue> }) => fetchJSON<Routing>("/api/models/routing", j("PUT", body)),
  saveAudioLanguage: (language: string) => fetchJSON<{ language: string }>("/api/models/transcription-language", j("PUT", { language })),
  spend: () => fetchJSON<Spend>("/api/usage/spend"),
  limits: () => fetchJSON<Limits>("/api/limits"),
  saveLimits: (l: Partial<Limits>) => fetchJSON<Limits>("/api/limits", j("PUT", l)),
};

// ---- tarefas (a ordem e os textos são os do design) ----

export type TaskDef = {
  id: TaskId;
  label: string;
  desc: string;
  icon: string;
  /** O que o modelo precisa saber fazer. */
  cap: Cap;
  parent?: TaskId;
  root?: boolean;
  sub?: boolean;
  jev?: boolean;
  /** Modelos que o design destaca como "recomendado". */
  rec?: string[];
  /** A escolha fica salva, mas o canal ainda não usa o modelo próprio (selo "em breve"). */
  soon?: boolean;
};

export const TASKS: TaskDef[] = [
  { id: "default", label: "Modelo padrão", desc: "Usado por tudo que não tem escolha própria.", icon: "star", cap: "text", root: true },
  { id: "main", label: "Conversa principal", desc: "Quando você conversa com o Hermes pelo painel.", icon: "messages-square", cap: "text", parent: "default" },
  { id: "channel.telegram", label: "Telegram", desc: "Conversas com a equipe.", icon: "send", cap: "text", parent: "main", sub: true, soon: true },
  { id: "channel.whatsapp", label: "WhatsApp", desc: "Conversas diretas com clientes.", icon: "phone", cap: "text", parent: "main", sub: true, soon: true },
  { id: "channel.api", label: "API", desc: "Pedidos de outros sistemas, como o painel da Aibiz.", icon: "braces", cap: "text", parent: "main", sub: true, soon: true },
  { id: "group_analysis", label: "Análise dos grupos", desc: "Lê cada lote de mensagens e escreve a análise.", icon: "scan-search", cap: "text", parent: "default" },
  { id: "triage_jev", label: "Triagem", desc: "Modelo de decisão: classifica e decide rápido e barato, não escreve textos.", icon: "split", cap: "decision", parent: "default", jev: true, rec: ["jev-latest", "jev-1.13", "typesafe/jev-1.13"] },
  { id: "vision", label: "Visão de imagens", desc: "Entende prints, fotos e vídeos enviados nos grupos.", icon: "image", cap: "vision", parent: "default", rec: ["google/gemini-2.5-flash"] },
  { id: "transcription", label: "Transcrição de áudio", desc: "Transforma áudios de WhatsApp em texto.", icon: "mic", cap: "audio", parent: "default", rec: ["whisper-large-v3-turbo"] },
  { id: "compaction", label: "Resumo e compactação", desc: "Encurta conversas longas para caberem na memória.", icon: "shrink", cap: "text", parent: "default" },
  { id: "scheduled", label: "Tarefas agendadas", desc: "O que roda sozinho em horários marcados, como o resumo diário.", icon: "calendar-clock", cap: "text", parent: "default" },
];
export const TASK = Object.fromEntries(TASKS.map((t) => [t.id, t])) as Record<TaskId, TaskDef>;

export const CAPS: Record<Cap, { icon: string; label: string }> = {
  text: { icon: "type", label: "Texto" },
  vision: { icon: "image", label: "Lê imagens" },
  audio: { icon: "audio-lines", label: "Ouve áudio" },
  decision: { icon: "split", label: "Modelo de decisão" },
};
/** Tooltip do selo "em breve" nas linhas de canal. */
export const SOON_HINT = "A escolha fica salva, mas por enquanto o Hermes usa o modelo da conversa principal nestes canais.";
export const NEED: Record<Cap, string> = { text: "", vision: "precisa ler imagens", audio: "precisa ouvir áudio", decision: "modelos de decisão primeiro" };
export const LACKS: Record<Cap, string> = { vision: "não lê imagens", audio: "não ouve áudio", decision: "não é um modelo de decisão", text: "não gera texto" };

// ---- configuração em edição ----

/** Uma tarefa na tela: herdando (`def`) ou com escolha própria. `p` nulo = sem modelo. */
export type TaskCfg = { def: true } | { def?: false; p: string | null; m: string | null; min?: number };
export type Cfg = Record<TaskId, TaskCfg>;
export type Eff = { none: true; own: boolean } | { none?: false; p: string; m: string; own: boolean; from: TaskId };

/** Confiança mínima da triagem em %, de 50 a 95 de 5 em 5. */
export const MIN_CONF = { min: 50, max: 95, step: 5, def: 70 };

export function toCfg(r: Routing): Cfg {
  const cfg = { default: r.default ? { p: r.default.provider, m: r.default.model } : { p: null, m: null } } as Cfg;
  for (const t of TASKS) {
    if (t.root) continue;
    const v = r.tasks[t.id as Exclude<TaskId, "default">];
    if ("inherit" in v) cfg[t.id] = { def: true };
    else if (t.jev) cfg[t.id] = { p: v.provider || null, m: v.model || null, min: Math.round((v.minConfidence ?? MIN_CONF.def / 100) * 100) };
    else cfg[t.id] = { p: v.provider, m: v.model };
  }
  return cfg;
}

const same = (a: TaskCfg, b: TaskCfg) => JSON.stringify(a) === JSON.stringify(b);
export const changedTasks = (cfg: Cfg, saved: Cfg): TaskId[] => TASKS.map((t) => t.id).filter((id) => !same(cfg[id], saved[id]));

/** Só o que mudou; o backend valida o pedido inteiro e recusa tudo ou grava tudo. */
export function toBody(cfg: Cfg, saved: Cfg): { default?: ModelPick; tasks: Record<string, RoutingValue> } | null {
  const ids = changedTasks(cfg, saved);
  if (!ids.length) return null;
  const body: { default?: ModelPick; tasks: Record<string, RoutingValue> } = { tasks: {} };
  for (const id of ids) {
    const c = cfg[id];
    if (id === "default") {
      if ("p" in c && c.p && c.m) body.default = { provider: c.p, model: c.m };
    } else if (c.def) {
      body.tasks[id] = { inherit: true };
    } else if (c.p && c.m) {
      body.tasks[id] = { provider: c.p, model: c.m, ...(TASK[id].jev && c.min !== undefined ? { minConfidence: c.min / 100 } : {}) };
    }
  }
  return body;
}

export const findProvider = (provs: Provider[], id: string | null | undefined) => provs.find((p) => p.id === id);
export const findModel = (provs: Provider[], p: string | null | undefined, m: string | null | undefined) => findProvider(provs, p)?.models.find((x) => x.id === m);

/** Segue a herança até uma escolha própria (os canais herdam da Conversa principal; o resto, do padrão). */
export function eff(id: TaskId, cfg: Cfg): Eff {
  const t = TASK[id];
  const c = cfg[id];
  if (t.root || !c.def) return "p" in c && c.p && c.m ? { p: c.p, m: c.m, own: true, from: id } : { none: true, own: true };
  const r = eff(t.parent as TaskId, cfg);
  return { ...r, own: false };
}

/** O modelo serve à capacidade? Quando o catálogo não o conhece, vale para texto e visão (não dá para provar o contrário). */
export const modelOk = (m: ModelEntry | undefined, cap: Cap): boolean => !!m && (m.caps.includes(cap) || (!m.capsKnown && (cap === "text" || cap === "vision")));

// ---- custo ----

/** US$ por mil unidades da tarefa. `null` = sem dado (preço ou tamanho médio desconhecidos). */
export function costPerK(m: ModelEntry | undefined, meta: TaskMeta | undefined): number | null {
  if (!m) return null;
  if (m.pricePerMin != null) return 1000 * m.pricePerMin;
  if (!meta || meta.tokensIn == null || m.priceIn == null) return null;
  return (1000 * (meta.tokensIn * m.priceIn + (meta.tokensOut ?? 0) * (m.priceOut ?? 0))) / 1e6;
}

export function usd(n: number): string {
  if (n > 0 && n < 0.01) return "< US$ 0,01";
  return "US$ " + n.toFixed(2).replace(".", ",").replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
export const usdOrDash = (n: number | null) => (n == null ? "—" : usd(n));

export function ctxLabel(n: number | null): string {
  if (!n) return "";
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)} ${n >= 2_000_000 ? "milhões" : "milhão"}`.replace(".", ",");
  return `${Math.round(n / 1000)} mil`;
}

/** Uma linha por modelo, no seletor: latência, saída em texto, preço por minuto ou contexto. */
export function modelMeta(m: ModelEntry): string {
  if (m.caps.includes("decision")) return `decide em ${m.latency ?? "instantes"} · saída grátis`;
  if (m.pricePerMin != null) return `US$ ${String(m.pricePerMin).replace(".", ",")} por minuto`;
  if (m.context) return `${ctxLabel(m.context)} de contexto`;
  return m.capsKnown ? "" : "capacidades não confirmadas";
}

export const hostOf = (u: string) => {
  try {
    return new URL(u).host;
  } catch {
    return u;
  }
};
export const urlOk = (u: string) => /^https?:\/\/[^\s/]+\.[^\s]+|^https?:\/\/localhost/.test((u ?? "").trim());

const PALETTE = ["#a395ff", "#7cb8ff", "#5ee0c0", "#f5c26b", "#62d6f0", "#f48fd0", "#c2e66b", "#ff9f7a"];
const FIXED: Record<string, string> = { nous: "#a395ff", openrouter: "#7cb8ff", openai: "#5ee0c0", groq: "#f5c26b", typesafe: "#62d6f0" };
/** Cor estável do avatar do provedor. */
export const providerColor = (id: string) => FIXED[id] ?? PALETTE[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];

const pad = (n: number) => String(n).padStart(2, "0");
export const stamp = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Frase do cartão de um provedor com problema. */
export function errorLine(p: Provider): string {
  const e = p.error;
  if (!e) return "";
  const since = e.since ? ` desde ${stamp(e.since)}` : "";
  if (e.code === "unauthorized") return `Chave recusada${since}. Tudo que usa ${p.name} está falhando.`;
  if (e.code === "unreachable") return `Sem resposta${since}. Tudo que usa ${p.name} está falhando.`;
  return e.message || "O provedor não respondeu como esperado.";
}

/** "Conectado em 0,5 s · 4 modelos encontrados" (no diálogo de adicionar). */
export function connectLine(r: Extract<TestResult, { ok: true }>): string {
  const s = (r.latencyMs / 1000).toFixed(1).replace(".", ",");
  return r.models.length ? `Conectado em ${s} s · ${r.models.length} ${r.models.length === 1 ? "modelo encontrado" : "modelos encontrados"}` : `Conectado em ${s} s`;
}

/** Resultado do teste em um cartão salvo. */
export function testLine(r: TestResult): string {
  if (!r.ok) return r.message;
  const s = (r.latencyMs / 1000).toFixed(1).replace(".", ",");
  return r.models.length ? `Respondeu em ${s} s · ${r.models.length} ${r.models.length === 1 ? "modelo" : "modelos"}` : `Respondeu em ${s} s`;
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ---- remover provedor ----

export type RemovalEffect = { task: string; what: string; tone: "err" | "back" };

/** O que acontece com cada tarefa que usa o provedor (o backend faz o mesmo ao remover). */
export function removalEffects(id: string, cfg: Cfg, provs: Provider[]): RemovalEffect[] {
  const out: RemovalEffect[] = [];
  const without = provs.filter((p) => p.id !== id);
  for (const t of TASKS) {
    const c = cfg[t.id];
    if (c.def || !("p" in c) || c.p !== id) continue;
    if (t.root) {
      out.push({ task: t.label, what: "fica vazio: tudo que herda o padrão para até você escolher outro.", tone: "err" });
      continue;
    }
    if (t.jev) {
      out.push({ task: t.label, what: "fica sem modelo: a triagem desliga e os lotes vão direto para a análise completa.", tone: "err" });
      continue;
    }
    const next = eff(t.parent as TaskId, { ...cfg, [t.id]: { def: true } } as Cfg);
    const nm = !next.none && next.p !== id ? findModel(without, next.p, next.m) : undefined;
    if (nm && modelOk(nm, t.cap)) out.push({ task: t.label, what: `volta para o padrão (${nm.id}).`, tone: "back" });
    else out.push({ task: t.label, what: `fica sem modelo: ${t.cap === "vision" ? "as imagens deixam de ser analisadas" : t.cap === "audio" ? "os áudios deixam de ser transcritos" : "a tarefa para"}.`, tone: "err" });
  }
  return out;
}

// ---- limites ----

export const ON_LIMIT: { k: OnLimit; label: string; icon: string; color: string; d: string }[] = [
  { k: "notify", label: "Avisar e continuar", icon: "bell", color: "var(--info)", d: "Só avisa. O gasto pode passar do limite." },
  { k: "pause_non_urgent", label: "Pausar o que não é urgente", icon: "circle-pause", color: "var(--warn)", d: "Só análises críticas e altas usam o modelo; as outras chegam à equipe com as mensagens, sem gastar. Conversas e triagem continuam." },
  { k: "pause_profile", label: "Pausar o perfil", icon: "octagon-pause", color: "var(--err)", d: "O Hermes para tudo neste perfil e volta sozinho quando o gasto sai do limite (no dia seguinte, ou no mês seguinte se o estouro foi mensal)." },
];
export const ALERT_OPTS = [50, 80, 90];
export const LIMIT_STEP = { day: 5, month: 50 };

export type LimitView = { pct: number; over: boolean; warn: boolean; width: string; bar: string; border: string };

/** Barra de uso: âmbar ao passar do alerta, vermelha ao passar do limite. */
export function limitView(spent: number, limit: number, alertPct: number): LimitView {
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const over = pct >= 100;
  const warn = pct >= alertPct;
  return {
    pct, over, warn, width: Math.min(100, pct) + "%",
    bar: over ? "var(--err)" : warn ? "var(--warn)" : "var(--acc)",
    border: over ? "color-mix(in oklab,var(--err) 45%,transparent)" : warn ? "color-mix(in oklab,var(--warn) 45%,transparent)" : "var(--line)",
  };
}

/** No ritmo atual, quanto o mês fecha: gasto até hoje ÷ dias passados × dias do mês. */
export const projectMonth = (s: Spend): number => (s.dayOfMonth > 0 ? (s.month / s.dayOfMonth) * s.daysInMonth : s.month);

export type LimitsCfg = Required<Omit<Limits, "saved">>;
export const limitsChanged = (a: LimitsCfg, b: LimitsCfg) => (["dailyUsd", "monthlyUsd", "alertPct", "onLimit"] as const).filter((k) => a[k] !== b[k]);
