// Contrato de dados da Central de Operações. Hoje só existe o mockAdapter
// (mesmos dados do protótipo); o apiAdapter entra tela a tela conforme os
// endpoints do backend nascem, sem mudar os componentes.
import { liveAdapter } from "./live";
import { mockAdapter } from "./mock";
import { served } from "./served";

export type BizId = string;
export type Business = { id: BizId; name: string; color: string };
export type Priority = "urgente" | "voce" | "resolve" | "ignorar";
export type AutonomyMode = 0 | 1 | 2; // Observar · Rascunhar · Autônomo
export type ActivityKind = "msg" | "cmd" | "pay" | "mem" | "tkt";

export type Session = {
  id: string;
  title: string;
  source: string;
  icon: string;
  when: string;
  group: "Hoje" | "Ontem" | "Esta semana";
  msgs: number;
  snippet: string;
};

export type InboxItem = {
  id: string;
  business: BizId;
  channel: string;
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

export type Channel = { id: string; name: string; icon: string; business: BizId; mode: AutonomyMode };

export type Health = {
  online: boolean;
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
  target: { kind: "reply"; id: string; text: string } | { kind: "approval"; id: string };
};

export interface OpsAdapter {
  load(): Promise<OpsSnapshot>;
  /** Estado atual do kill switch (pode mudar por fora, ex.: `hermes pause` no terminal). */
  getPaused(): Promise<boolean>;
  /** Kill switch global: o gateway não envia nem executa nada enquanto `true`. */
  setPaused(paused: boolean): Promise<void>;
  /** Executa a ação e devolve a entrada que foi registrada na Atividade. */
  perform(action: OnBehalf): Promise<Activity>;
  /** Negar não sai em nome do usuário: não passa pelo kill switch nem vira Atividade. */
  deny(approvalId: string): Promise<void>;
  archive(inboxId: string): Promise<void>;
  /** Reverte uma ação da Atividade quando ela é reversível. */
  undo(activityId: string): Promise<void>;
  setAutonomy(channelId: string, mode: AutonomyMode): Promise<void>;
}

export const adapter: OpsAdapter = served ? liveAdapter : mockAdapter;
