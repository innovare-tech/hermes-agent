// Conversa real: JSON-RPC do tui_gateway via /api/ws (mesmo cliente do ChatSidebar).
import type { RpcMethods, TranscriptMessage, Usage } from "@hermes/shared";
import { api } from "@/lib/api";
import { GatewayClient } from "@/lib/gatewayClient";
import type { Session } from "../adapter";
import type { SessionLiveInfo } from "@hermes/shared";
import type { AgentMessage, ApprovalChoice, ChatAdapter, ChatEvent, ChatMessage, SessionInfo, ToolStep } from "./types";

let gw: GatewayClient | null = null;
async function client() {
  gw ??= new GatewayClient();
  await gw.connect();
  return gw;
}

async function call<M extends keyof RpcMethods>(method: M, params: RpcMethods[M]["params"]): Promise<RpcMethods[M]["result"]> {
  return (await client()).request<RpcMethods[M]["result"]>(method, params as Record<string, unknown>);
}

/** id persistido (lista de sessões / URL) → id da sessão viva no gateway. */
const live = new Map<string, string>();

async function liveId(storedId: string) {
  let id = live.get(storedId);
  if (!id) {
    id = (await call("session.resume", { session_id: storedId, omit_messages: true })).session_id;
    live.set(storedId, id);
  }
  return id;
}

export function toolKind(name: string) {
  if (name.startsWith("skill")) return "skill";
  if (/terminal|shell|process|exec/.test(name)) return "terminal";
  if (/delegate|subagent/.test(name)) return "delegate";
  if (name.startsWith("memory")) return "memory";
  if (name.startsWith("cron")) return "cron";
  if (/web|browser|search|fetch/.test(name)) return "web";
  return "file";
}

const fmtDur = (s?: number | null) => (s == null ? "" : s.toFixed(1).replace(".", ",") + "s");
const text = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v, null, 2));
const argsPreview = (args?: Record<string, unknown> | null) => (args ? Object.values(args).map(text).join(" ").slice(0, 200) : "");

export function usageMeta(u: Usage | undefined, secs: number) {
  if (!u) return undefined;
  const parts = [u.model, u.total != null ? (u.total / 1000).toFixed(1).replace(".", ",") + "k tokens" : null, u.cost_usd != null ? "$" + u.cost_usd.toFixed(2).replace(".", ",") : null, secs.toFixed(1).replace(".", ",") + "s"];
  return parts.filter(Boolean).join(" · ");
}

/** Agrupa a transcrição em balões: cada usuário seguido de um único bloco do agente com os passos. */
export function fromTranscript(rows: TranscriptMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let agent: AgentMessage | null = null;
  rows.forEach((r, i) => {
    const id = String(r.row_id ?? i);
    if (r.role === "user") {
      agent = null;
      out.push({ id, role: "user", text: r.text ?? text(r.content) });
      return;
    }
    if (r.role !== "assistant" && r.role !== "tool") return;
    if (!agent) {
      agent = { id, role: "agent", steps: [], text: "", live: false };
      out.push(agent);
    }
    if (r.role === "tool") {
      const name = r.name ?? "tool";
      agent.steps.push({ id: r.tool_call_id ?? id, kind: toolKind(name), name, target: r.context ?? argsPreview(r.args), dur: "", status: "ok", output: r.text ?? text(r.content) });
    } else if (r.text) {
      agent.text = agent.text ? agent.text + "\n\n" + r.text : r.text;
    }
  });
  return out;
}

const fromUsage = (u?: Usage | null): Partial<SessionInfo> =>
  u ? { ctxUsed: u.context_used ?? 0, ctxMax: u.context_max ?? 0, cost: u.cost_usd ?? 0, ...(u.model ? { model: u.model } : {}) } : {};

export const fromLiveInfo = (i?: SessionLiveInfo | null): SessionInfo => ({
  model: i?.model ?? "",
  backend: i?.terminal_backend ?? "local",
  persona: i?.personality ?? "padrão",
  ctxUsed: 0,
  ctxMax: 0,
  cost: 0,
  ...fromUsage(i?.usage),
});

function group(startedAt?: number | null): Session["group"] {
  const days = startedAt ? (Date.now() / 1000 - startedAt) / 86400 : 99;
  return days < 1 ? "Hoje" : days < 2 ? "Ontem" : "Esta semana";
}

const SOURCE_ICON: Record<string, string> = { telegram: "send", discord: "message-circle", whatsapp: "phone", cron: "calendar-clock", cli: "square-terminal", tui: "square-terminal" };

export const gatewayChat: ChatAdapter = {
  async sessions() {
    const { sessions } = await call("session.list", { limit: 30 });
    return sessions.map((s) => {
      const src = (s.source ?? "web").toLowerCase();
      const when = s.started_at ? new Date(s.started_at * 1000) : null;
      return {
        id: s.id,
        title: s.title || s.preview || "Sem título",
        source: src[0].toUpperCase() + src.slice(1),
        icon: SOURCE_ICON[src] ?? "globe",
        when: when ? when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "",
        group: group(s.started_at),
        msgs: s.message_count ?? 0,
        snippet: s.preview ?? "",
      };
    });
  },

  async create() {
    const r = await call("session.create", {});
    live.set(r.stored_session_id, r.session_id);
    return r.stored_session_id;
  },

  async history(sessionId) {
    if (!sessionId) {
      const m = await api.getModelInfo();
      return { messages: [], info: { ...fromLiveInfo(null), model: m.model, ctxMax: m.effective_context_length } };
    }
    const r = await call("session.resume", { session_id: sessionId });
    live.set(sessionId, r.session_id);
    return { messages: fromTranscript(r.messages ?? []), info: fromLiveInfo(r.info) };
  },

  async send(sessionId, prompt, on) {
    const sid = await liveId(sessionId);
    const c = await client();
    const t0 = Date.now();
    const started = new Map<string, ToolStep>();
    const rpcToApproval = new Map<string, string>();
    return new Promise<void>((resolve, reject) => {
      const offs = [
        // Comando perigoso etc.: o gateway pergunta e espera a resposta (requisição servidor→cliente).
        c.onRequest((req) => {
          if (req.method !== "approval" || req.params.session_id !== sid) return false;
          const p = req.params as { request_id?: string; command?: string; description?: string; choices?: ApprovalChoice[] };
          rpcToApproval.set(req.id, p.request_id ?? req.id);
          on({
            type: "approval",
            approval: {
              id: p.request_id ?? req.id,
              command: p.command ?? "",
              description: p.description ?? "",
              choices: p.choices?.length ? p.choices : ["once", "deny"],
              respond: (choice) => req.respond({ choice }),
            },
          });
        }),
        c.on("request.cancel", (e) => {
          const id = e.payload?.id && rpcToApproval.get(e.payload.id);
          if (id) on({ type: "approval.cancel", id });
        }),
        c.on("approval.cancelled", (e) => {
          if (e.session_id === sid) e.payload?.request_ids?.forEach((id) => on({ type: "approval.cancel", id }));
        }),
        c.on("tool.start", (e) => {
          if (e.session_id !== sid || !e.payload) return;
          const p = e.payload;
          const step: ToolStep = { id: p.tool_id, kind: toolKind(p.name), name: p.name, target: p.preview ?? p.context ?? p.args_text ?? argsPreview(p.args), dur: "", status: "run", output: "" };
          started.set(p.tool_id, step);
          on({ type: "step", step });
        }),
        c.on("tool.complete", (e) => {
          if (e.session_id !== sid || !e.payload) return;
          const p = e.payload;
          const base = started.get(p.tool_id) ?? { id: p.tool_id, kind: toolKind(p.name), name: p.name, target: argsPreview(p.args), dur: "", status: "run" as const, output: "" };
          on({ type: "step", step: { ...base, status: "ok", dur: fmtDur(p.duration_s), output: p.result_text ?? p.summary ?? text(p.result) } });
        }),
        c.on("message.delta", (e) => {
          if (e.session_id === sid && e.payload?.text) on({ type: "delta", text: e.payload.text });
        }),
        c.on("message.complete", (e) => {
          if (e.session_id !== sid) return;
          const p = e.payload ?? {};
          if (p.status === "error") on({ type: "error", message: text(p.error) || "O agente falhou nesse turno" });
          else on({ type: "done", meta: usageMeta(p.usage ?? undefined, (Date.now() - t0) / 1000), info: fromUsage(p.usage) });
          done();
        }),
      ];
      const done = () => {
        offs.forEach((off) => off());
        resolve();
      };
      submit(sid, prompt, on, done).catch((err) => {
        offs.forEach((off) => off());
        reject(err);
      });
    });
  },

  async interrupt(sessionId) {
    const id = live.get(sessionId);
    if (id) await call("session.interrupt", { session_id: id });
  },

  async slashCommands() {
    const r = await call("commands.catalog", {});
    return (r.pairs ?? []).map(([cmd, desc]) => ({ cmd: cmd.startsWith("/") ? cmd : "/" + cmd, desc: desc ?? "" }));
  },
};

/** Slash commands rodam no gateway; os que viram prompt (send/skill) seguem como turno normal. */
async function submit(sid: string, prompt: string, on: (e: ChatEvent) => void, done: () => void) {
  if (prompt.startsWith("/")) {
    const r = await call("slash.exec", { session_id: sid, command: prompt.slice(1) });
    if ((r.type === "send" || r.type === "skill") && r.message) {
      await call("prompt.submit", { session_id: sid, text: r.message });
      return;
    }
    on({ type: "delta", text: r.output ?? r.notice ?? r.message ?? "" });
    on({ type: "done" });
    done();
    return;
  }
  await call("prompt.submit", { session_id: sid, text: prompt });
}
