import type { Session } from "../adapter";

export type StepStatus = "run" | "ok" | "err";

export type ToolStep = {
  id: string;
  /** Família da ferramenta — escolhe o ícone (skill, terminal, delegate, memory, cron, web, file). */
  kind: string;
  name: string;
  target: string;
  dur: string;
  status: StepStatus;
  output: string;
};

export type Block =
  | { kind: "prs"; items: { n: number; title: string; note: string; tag: string; tone: "ok" | "err" | "warn" }[] }
  | { kind: "cron"; title: string; detail: string };

export type ApprovalChoice = "once" | "session" | "always" | "deny";

/** Pedido de aprovação que chegou no meio do turno (comando perigoso etc.). */
export type ChatApproval = {
  id: string;
  command: string;
  description: string;
  choices: ApprovalChoice[];
  status: "pending" | "approved" | "denied" | "cancelled";
  respond: (choice: ApprovalChoice) => void;
};

export type UserMessage = { id: string; role: "user"; text: string };
export type AgentMessage = {
  id: string;
  role: "agent";
  steps: ToolStep[];
  text: string;
  live: boolean;
  blocks?: Block[];
  approval?: ChatApproval;
  meta?: string;
  learned?: string;
};
export type ChatMessage = UserMessage | AgentMessage;

/** O que chega durante um turno — mesmo formato para o mock e para o gateway real. */
export type ChatEvent =
  | { type: "step"; step: ToolStep }
  | { type: "delta"; text: string }
  | { type: "done"; meta?: string; learned?: string; info?: Partial<SessionInfo> }
  | { type: "error"; message: string }
  | { type: "approval"; approval: Omit<ChatApproval, "status"> }
  | { type: "approval.cancel"; id: string };

export type SessionInfo = {
  model: string;
  backend: string;
  persona: string;
  ctxUsed: number;
  ctxMax: number;
  cost: number;
  /** Só aparecem no painel quando o backend expõe. */
  memories?: string[];
  skill?: { name: string; version: string };
  subagents?: { name: string; dur: string }[];
};

export type SlashCommand = { cmd: string; desc: string };

export interface ChatAdapter {
  sessions(): Promise<Session[]>;
  /** Cria uma sessão nova e devolve o id persistido. */
  create(): Promise<string>;
  /** `null` = conversa nova: sem mensagens, com os padrões do agente (modelo, contexto…). */
  history(sessionId: string | null): Promise<{ messages: ChatMessage[]; info: SessionInfo }>;
  /** Envia o prompt e chama `on` a cada evento até `done`/`error`. */
  send(sessionId: string, text: string, on: (e: ChatEvent) => void): Promise<void>;
  interrupt(sessionId: string): Promise<void>;
  slashCommands(): Promise<SlashCommand[]>;
  /** Troca o modelo da sessão viva; sem sessão (conversa nova), vale como padrão do agente. */
  setModel(sessionId: string | null, provider: string, model: string): Promise<void>;
}
