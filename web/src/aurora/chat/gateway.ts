// Conversa real: JSON-RPC do tui_gateway via /api/ws (mesmo cliente do ChatSidebar).
import type { RpcMethods, TranscriptMessage, Usage } from "@hermes/shared";
import { api } from "@/lib/api";
import { GatewayClient } from "@/lib/gatewayClient";
import type { Session } from "../adapter";
import type { SessionLiveInfo } from "@hermes/shared";
import { shortWhen, sourceIcon, sourceLabel } from "./sources";
import type { AgentMessage, ApprovalChoice, ChatAdapter, ChatEvent, ChatMessage, SessionInfo, ToolStep } from "./types";

let gw: GatewayClient | null = null;
let connecting: Promise<void> | null = null;
/** Chamadas simultâneas esperam a MESMA conexão: ``connect()`` volta na hora se já está "conectando",
 *  e a segunda chamada saía antes do socket abrir ("gateway not connected"). */
async function client() {
  gw ??= new GatewayClient();
  if (gw.connectionState !== "open") {
    connecting ??= gw.connect().finally(() => (connecting = null));
    await connecting;
  }
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

/** Prévia do passo em português ("echo a + 2 commands" → "echo a + 2 comandos"). */
export const ptPreview = (t: string) => t.replace(/\+ ?(\d+) commands?\b/g, (_m, n: string) => `+ ${n} ${n === "1" ? "comando" : "comandos"}`);

/** Saída de ferramenta legível: JSON {output, exit_code, error} vira o texto + o erro, se houver. */
export function toolOutput(raw: unknown): string {
  const s = text(raw);
  try {
    const j = JSON.parse(s) as Record<string, unknown>;
    if (j && typeof j === "object" && typeof j.output === "string") {
      const extra = [j.error ? `erro: ${text(j.error)}` : "", j.exit_code != null && j.exit_code !== 0 ? `código de saída ${j.exit_code}` : ""].filter(Boolean);
      return [j.output, ...extra].filter(Boolean).join(String.fromCharCode(10));
    }
    return JSON.stringify(j, null, 2);
  } catch {
    return s;
  }
}

export function usageMeta(u: Usage | undefined, secs: number) {
  if (!u) return undefined;
  // Sem soma de tokens: o total do turno junta várias chamadas e não bate com o contexto do painel.
  const parts = [u.model, u.cost_usd != null ? money(u.cost_usd) : null, secs.toFixed(1).replace(".", ",") + "s"];
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
      agent.steps.push({ id: r.tool_call_id ?? id, kind: toolKind(name), name, target: ptPreview(r.context ?? argsPreview(r.args)), dur: "", status: "ok", output: toolOutput(r.text ?? r.content ?? "") });
    } else if (r.text) {
      agent.text = agent.text ? agent.text + "\n\n" + r.text : r.text;
    }
  });
  return out;
}

const fromUsage = (u?: Usage | null): Partial<SessionInfo> =>
  u ? { ctxUsed: u.context_used ?? null, ...(u.context_max ? { ctxMax: u.context_max } : {}), cost: u.cost_usd ?? null, ...(u.model ? { model: u.model } : {}) } : {};

/** "US$ 0,16". */
export const money = (usd: number) => "US$ " + usd.toFixed(2).replace(".", ",");

export const fromLiveInfo = (i?: SessionLiveInfo | null): SessionInfo => ({
  model: i?.model ?? "",
  backend: i?.terminal_backend ?? "local",
  persona: i?.personality ?? "padrão",
  ctxUsed: null,
  ctxMax: 0,
  cost: null,
  ...fromUsage(i?.usage),
});

function group(startedAt?: number | null): Session["group"] {
  const days = startedAt ? (Date.now() / 1000 - startedAt) / 86400 : 99;
  return days < 1 ? "Hoje" : days < 2 ? "Ontem" : days < 7 ? "Esta semana" : "Mais antigas";
}

/** Comandos que fazem sentido no painel web, com descrição em português. Os de terminal (/redraw,
 *  /mouse, /quit, /prompt…) e os de conta/instalação ficam de fora; as skills entram depois. */
export const WEB_COMMANDS: [string, string][] = [
  ["/retry", "Gera a última resposta de novo"],
  ["/undo", "Volta uma pergunta: apaga a última troca"],
  ["/title", "Dá um título a esta conversa — /title Nome"],
  ["/compress", "Resume o começo da conversa para liberar contexto"],
  ["/btw", "Pergunta paralela, sem interromper a tarefa em andamento"],
  ["/steer", "Corrige o rumo da tarefa em andamento, sem parar"],
  ["/queue", "Deixa um pedido na fila para o próximo turno"],
  ["/goal", "Define um objetivo que o Hermes persegue até cumprir"],
  ["/plan", "Escreve um plano de implementação sem executar nada"],
  ["/review", "Um subagente revisa o trabalho que acabou de ser feito"],
  ["/learn", "Ensina uma skill nova a partir do que você descrever"],
  ["/memory", "Revisa o que o Hermes quer guardar na memória"],
  ["/model", "Troca o modelo desta conversa — /model nome"],
  ["/personality", "Troca a personalidade das respostas"],
  ["/reasoning", "Ajusta quanto o modelo pensa antes de responder"],
  ["/fast", "Modo rápido do provedor (quando disponível)"],
  ["/status", "Mostra modelo, tokens e contexto desta conversa"],
  ["/context", "Mostra em detalhe o que ocupa o contexto"],
  ["/usage", "Mostra consumo de tokens e limites"],
  ["/insights", "Resumo e estatísticas do seu uso"],
  ["/stop", "Encerra processos que o agente deixou rodando em segundo plano"],
  ["/help", "Lista os comandos"],
  ["/version", "Versão do Hermes"],
];

export const gatewayChat: ChatAdapter = {
  async sessions() {
    const { sessions } = await call("session.list", { limit: 30 });
    return sessions.map((s) => {
      const when = s.started_at ? new Date(s.started_at * 1000) : null;
      const recent = group(s.started_at);
      return {
        id: s.id,
        title: s.title || s.preview || "Sem título",
        source: sourceLabel(s.source),
        icon: sourceIcon(s.source),
        when: !when ? "" : recent === "Hoje" || recent === "Ontem" ? when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : shortWhen(s.started_at),
        group: recent,
        msgs: s.message_count ?? 0,
        snippet: s.preview ?? "",
      };
    });
  },

  async create() {
    const r = await call("session.create", { source: "web" });
    live.set(r.stored_session_id, r.session_id);
    return r.stored_session_id;
  },

  async history(sessionId) {
    if (!sessionId) {
      const m = await api.getModelInfo();
      return { messages: [], info: { ...fromLiveInfo(null), model: m.model, ctxMax: m.effective_context_length } };
    }
    // O resume omite a saída das ferramentas; o histórico REST tem, ligada pelo tool_call_id.
    const [r, m, full] = await Promise.all([
      call("session.resume", { session_id: sessionId }),
      api.getModelInfo().catch(() => null),
      api.getSessionMessages(sessionId).catch(() => null),
    ]);
    live.set(sessionId, r.session_id);
    const outputs = new Map<string, unknown>();
    for (const x of (full?.messages ?? []) as { role?: string; tool_call_id?: string | null; content?: unknown }[]) if (x.role === "tool" && x.tool_call_id) outputs.set(x.tool_call_id, x.content);
    const rows = (r.messages ?? []).map((x) => (x.role === "tool" && x.tool_call_id && outputs.has(x.tool_call_id) && x.content == null ? { ...x, content: outputs.get(x.tool_call_id) } : x));
    const info = fromLiveInfo(r.info);
    return { messages: fromTranscript(rows), info: { ...info, ctxMax: info.ctxMax || m?.effective_context_length || 0 } };
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
          const step: ToolStep = { id: p.tool_id, kind: toolKind(p.name), name: p.name, target: ptPreview(p.preview ?? p.context ?? p.args_text ?? argsPreview(p.args)), dur: "", status: "run", output: "" };
          started.set(p.tool_id, step);
          on({ type: "step", step });
        }),
        c.on("tool.complete", (e) => {
          if (e.session_id !== sid || !e.payload) return;
          const p = e.payload;
          const base = started.get(p.tool_id) ?? { id: p.tool_id, kind: toolKind(p.name), name: p.name, target: argsPreview(p.args), dur: "", status: "run" as const, output: "" };
          on({ type: "step", step: { ...base, status: "ok", dur: fmtDur(p.duration_s), output: toolOutput(p.result_text ?? p.summary ?? p.result ?? "") } });
        }),
        c.on("message.delta", (e) => {
          if (e.session_id === sid && e.payload?.text) on({ type: "delta", text: e.payload.text });
        }),
        // Conexão caiu no meio do turno (painel reiniciou, rede): avisa e libera a conversa em vez de girar para sempre.
        c.onState((s) => {
          if (s !== "closed" && s !== "error") return;
          live.clear(); // ids vivos morrem com a conexão; o próximo envio retoma a sessão salva
          on({ type: "error", message: "A conexão com o Hermes caiu no meio da resposta. Mande de novo para continuar." });
          done();
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

  async setModel(sessionId, provider, model) {
    const id = sessionId ? live.get(sessionId) : undefined;
    if (!id) {
      // Conversa nova: troca o padrão do agente (mesma rota das Configurações).
      const body = { scope: "main" as const, provider, model };
      const r = (await api.setModelAssignment(body)) as { confirm_required?: boolean; message?: string };
      if (r.confirm_required) {
        if (!window.confirm(r.message ?? "Este modelo é caro. Usar mesmo assim?")) throw new Error("Troca de modelo cancelada");
        await api.setModelAssignment({ ...body, confirm_expensive_model: true });
      }
      return;
    }
    const value = `${model} --provider ${provider}`;
    const r = (await call("config.set", { session_id: id, key: "model", value })) as { confirm_required?: boolean; confirm_message?: string };
    if (r.confirm_required) {
      if (!window.confirm(r.confirm_message ?? "Este modelo é caro. Usar mesmo assim?")) throw new Error("Troca de modelo cancelada");
      await call("config.set", { session_id: id, key: "model", value, confirm_expensive_model: true });
    }
  },

  async slashCommands() {
    const r = await call("commands.catalog", {});
    const norm = (c: string) => (c.startsWith("/") ? c : "/" + c);
    const skillKeys = new Set(Object.keys(r.skills ?? {}).map(norm));
    const skills = (r.pairs ?? []).filter(([cmd]) => skillKeys.has(norm(cmd))).map(([cmd, desc]) => ({ cmd: norm(cmd), desc: desc ?? "", skill: true }));
    return [...WEB_COMMANDS.map(([cmd, desc]) => ({ cmd, desc })), ...skills];
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
