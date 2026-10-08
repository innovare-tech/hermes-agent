// Contrato de dados da Central de Operações. Uma implementação: o backend do Hermes
// (/api/ops/*, /api/estop, /api/status, /api/analytics) — ver live.ts.
import { liveAdapter } from "./live";

export type BizId = string;
export type Business = { id: BizId; name: string; color: string };
export type Priority = "urgente" | "voce" | "resolve" | "ignorar";
export type AutonomyMode = 0 | 1 | 2; // Observar · Rascunhar · Autônomo
export type ActivityKind = "msg" | "cmd" | "pay" | "mem" | "tkt" | "cfg";

export type Session = {
  id: string;
  title: string;
  source: string;
  icon: string;
  when: string;
  group: "Hoje" | "Ontem" | "Esta semana" | "Mais antigas";
  msgs: number;
  snippet: string;
};

export type InboxItem = {
  id: string;
  /** "" = sem negócio (aparece em todos os filtros). */
  business: BizId;
  channel: string;
  channelId: string;
  from: string;
  initials: string;
  receivedAt: string;
  priority: Priority;
  autonomyMode: string;
  summary: string;
  message: string;
  suggestedReply: string;
  sentAt?: string;
  context: string[];
};

export type Approval = {
  id: string;
  business: BizId;
  kind: "comando" | "reembolso" | "pagamento" | "mensagem";
  icon: string;
  title: string;
  risk: "baixo" | "médio" | "alto";
  createdAt: string;
  why: string;
  preview: string;
  source: string;
  /** Item da caixa de entrada que originou o rascunho (aprovar = enviar). */
  inboxId?: string;
};

export type RadarGroup = {
  id: string;
  business: BizId;
  channel: string;
  name: string;
  members: number;
  msgsToday: number;
  sentiment: number[];
  alert?: string;
  decisions: string[];
  mentions: string[];
  unanswered: string[];
};

export type Ticket = {
  n: number;
  business: BizId;
  client: string;
  title: string;
  system: string;
  status: string;
  owner: string;
  sla: string;
  message: string;
  relatedError: string;
  proposedFix: string;
};

export type Activity = {
  id: string;
  at: string;
  business: BizId;
  kind: ActivityKind;
  action: string;
  why: string;
  reversible: boolean;
  undone: boolean;
};

export type Channel = { id: string; name: string; icon: string; platform: string; kind: string; business: BizId; mode: AutonomyMode; lastSeen: string };

export type KbArticle = { title: string; source: string; uses: number };

export type Person = {
  id: string;
  name: string;
  initials: string;
  role: string;
  business: BizId;
  waitingHours: number;
  lastTopic: string;
  tone: string;
  channels: string;
  pending: string[];
};

export type PlaybookNode = { kind: "trigger" | "action" | "cond" | "end"; text: string; elseText?: string };
export type Playbook = {
  id: string;
  name: string;
  business: BizId;
  trigger: string;
  runs: number;
  enabled: boolean;
  lastRun: string;
  nodes: PlaybookNode[];
  /** Sintaxe do cron do Hermes ("every day 9am", "0 9 * * 1-5", "2h"); vazio = só manual. */
  schedule: string;
  /** "local" = só registra; ou "plataforma:chat_id". */
  deliver: string;
  nextRun: string;
  lastError: string;
};

export type PlaybookDraft = Omit<Playbook, "id" | "runs" | "lastRun" | "nextRun" | "lastError"> & { id?: string };

export type Health = {
  online: boolean;
  /** ok = tudo certo; warn = funciona mas algo precisa de você (ex.: gateway parado com canal ligado). */
  level: "ok" | "warn";
  /** O que precisa de atenção e onde resolver. */
  problems: { text: string; to: string }[];
  uptime: string;
  /** Gateways/plataformas conectados. */
  items: { name: string; status: "ok" | "warn" | "err"; value: string }[];
  responseTime: string;
};

export type Costs = {
  month: string;
  total: number;
  /** null = sem limite configurado. */
  limit: number | null;
  projection: number | null;
  byBusiness: { business: BizId; value: number }[];
};

export type Account = { plan: string; credits: string; home: string; version: string };

export type OpsSnapshot = {
  account: Account;
  businesses: Business[];
  inbox: InboxItem[];
  approvals: Approval[];
  radar: RadarGroup[];
  tickets: Ticket[];
  activity: Activity[];
  autonomy: Channel[];
  briefing: { business: BizId; text: string; at: string }[];
  last24h: { saved: string; autoReplies: number };
  health: Health;
  costs: Costs;
  watches: string[];
  support: { firstResponse: string; resolvedByHermes: string; csat: string; kbUsage: string };
  kb: KbArticle[];
  people: Person[];
  playbooks: Playbook[];
  /** Modo aplicado a canais que ainda não falaram com o Hermes. */
  defaultMode: AutonomyMode;
  paused: boolean;
};

/** Ação que sai em nome do usuário. Só é executada via `actOnBehalf` (kill switch + Atividade). */
export type OnBehalf = {
  business: BizId;
  kind: ActivityKind;
  action: string;
  why: string;
  reversible?: boolean;
  /** Texto do toast quando executa. */
  done: string;
  /** Texto do toast quando o agente está pausado. */
  blocked?: string;
  /** O que de fato executar. */
  target: { kind: "reply"; id: string; text: string } | { kind: "approval"; id: string } | { kind: "ticket"; n: number; op: "card" | "reply" } | { kind: "playbook"; id: string };
};

export interface OpsAdapter {
  load(): Promise<OpsSnapshot>;
  /** Estado atual do kill switch (pode mudar por fora, ex.: `hermes pause` no terminal). */
  getPaused(): Promise<boolean>;
  /** Kill switch global: o gateway não envia nem executa nada enquanto `true`. */
  setPaused(paused: boolean): Promise<void>;
  /** Executa a ação e devolve a entrada que foi registrada na Atividade. */
  perform(action: OnBehalf): Promise<Activity>;
  /** Negar um rascunho: não envia, a mensagem fica com você. */
  deny(approval: Approval): Promise<void>;
  archive(inboxId: string): Promise<void>;
  keep(inboxId: string): Promise<void>;
  /** Reverte uma ação da Atividade quando ela é reversível. */
  undo(activityId: string): Promise<void>;
  setAutonomy(channelId: string, mode: AutonomyMode): Promise<void>;
  setDefaultMode(mode: AutonomyMode): Promise<void>;
  setChannelBusiness(channelId: string, businessId: BizId | null): Promise<void>;
  saveBusiness(b: { id?: string; name: string; color: string }): Promise<Business>;
  deleteBusiness(id: string): Promise<void>;
  setWatches(words: string[]): Promise<void>;
  savePerson(p: Omit<Person, "id" | "initials" | "waitingHours"> & { id?: string }): Promise<Person>;
  deletePerson(id: string): Promise<void>;
  savePlaybook(p: PlaybookDraft): Promise<Playbook>;
  deletePlaybook(id: string): Promise<void>;
}

export const adapter: OpsAdapter = liveAdapter;
