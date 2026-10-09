// Conversa real: JSON-RPC do tui_gateway via /api/ws (mesmo cliente do ChatSidebar).
import type { RpcMethods, SessionLiveInfo, TranscriptMessage, Usage } from "@hermes/shared";
import { api, getManagementProfile } from "@/lib/api";
import { normalizeEffort } from "@/lib/reasoning-effort";
import { ask } from "../store";
import { GatewayClient } from "@/lib/gatewayClient";
import type { Session } from "../adapter";
import { fileToDataUrl } from "./attachments";
import { classifyError, isErrorText } from "./errors";
import { shortWhen, sourceIcon, sourceLabel } from "./sources";
import { buildSlashMenu } from "./slashMenu";
import { summarizeArgs } from "./toolLabels";
import type { AgentMessage, ApprovalChoice, ChatAdapter, ChatMessage, ModelSwitch, SendOpts, SessionInfo, SessionUsage, SlashResult, ToolStep, TurnStat } from "./types";

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
/** Total de tokens da sessão no fim do último turno: a diferença é o gasto do turno seguinte. */
const usageBase = new Map<string, number>();

/** Perfil que a conversa usa (o do seletor): vai em toda chamada que cria, lista ou retoma sessões. */
const profile = () => getManagementProfile() || undefined;

/** Troca de perfil: os ids vivos eram do perfil anterior; o próximo uso retoma a sessão no perfil novo. */
export const resetChatProfile = () => {
  live.clear();
  usageBase.clear();
};

async function liveId(storedId: string) {
  let id = live.get(storedId);
  if (!id) {
    id = (await call("session.resume", { session_id: storedId, omit_messages: true, profile: profile() })).session_id;
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

/** Saída de ferramenta legível: JSON {output, error, exit_code} vira o texto + o erro; outro JSON, formatado. */
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

/** A ferramenta devolveu um erro (campo `error` no JSON) — o passo fica vermelho. */
export function toolFailed(raw: unknown): boolean {
  try {
    const j = JSON.parse(text(raw)) as Record<string, unknown>;
    return !!j && typeof j === "object" && !Array.isArray(j) && !!j.error;
  } catch {
    return false;
  }
}

/** "US$ 0,16". */
export const money = (usd: number) => "US$ " + usd.toFixed(2).replace(".", ",");

/** Custo que dá para mostrar: o provedor que não informa (status "unknown") não é "grátis". */
const costOf = (u: { cost_usd?: number | null; cost_status?: string | null }) => (u.cost_status === "unknown" || u.cost_usd == null ? null : u.cost_usd);

export function usageOf(u?: Usage | null): SessionUsage | null {
  if (!u) return null;
  const input = u.input ?? u.prompt ?? 0;
  const output = u.output ?? u.completion ?? 0;
  return { input, output, reasoning: u.reasoning ?? 0, total: u.total ?? input + output, calls: u.calls ?? 0, cost: costOf(u) };
}

/** Rodapé do turno: modelo, tempo e tokens (mesmos números que o painel). */
export function turnStat(u: Usage | null | undefined, secs: number, base: number | undefined, model?: string): TurnStat {
  const us = usageOf(u);
  const tokens = us && base != null && us.total >= base ? us.total - base : undefined;
  return { model: u?.model ?? model, secs, tokens: tokens || undefined };
}

/** Texto do rodapé: "gemini-3.8-flash · 5,2s · 1,2k tokens". */
export function statLine(s?: TurnStat): string {
  if (!s) return "";
  const k = (n: number) => (n < 1000 ? String(n) : (n / 1000).toFixed(1).replace(".", ",") + "k");
  return [s.model, s.secs != null ? s.secs.toFixed(1).replace(".", ",") + "s" : "", s.tokens ? k(s.tokens) + " tokens" : "", s.cost != null ? money(s.cost) : ""].filter(Boolean).join(" · ");
}

/** Agrupa a transcrição em balões: cada usuário seguido de um único bloco do agente com os passos. */
export function fromTranscript(rows: TranscriptMessage[], o: { model?: string; running?: boolean } = {}): ChatMessage[] {
  const out: ChatMessage[] = [];
  let agent: AgentMessage | null = null;
  let t0: number | null = null;
  let t1: number | null = null;
  // Fecha o bloco do agente: rodapé (modelo + tempo), erro gravado como texto e turno interrompido.
  const close = (last: boolean) => {
    const a = agent;
    if (!a) return;
    if (a.text && isErrorText(a.text) && !a.steps.length) {
      a.error = classifyError(a.text, { model: o.model });
      a.text = "";
    }
    if (a.text || a.error) a.stat = { model: o.model, secs: t0 != null && t1 != null && t1 > t0 ? t1 - t0 : undefined };
    else if (!(last && o.running)) a.interrupted = true;
    agent = null;
  };
  rows.forEach((r, i) => {
    const id = String(r.row_id ?? i);
    if (r.role === "user") {
      close(false);
      // Pergunta sem nenhuma resposta antes da próxima = turno que parou: continua visível, marcado.
      if (out.length && out[out.length - 1].role === "user") out.push({ id: id + "-i", role: "agent", steps: [], text: "", live: false, interrupted: true });
      out.push({ id, role: "user", text: r.text ?? text(r.content), rowId: typeof r.row_id === "number" ? r.row_id : undefined });
      t0 = r.timestamp ?? null;
      t1 = null;
      return;
    }
    if (r.role !== "assistant" && r.role !== "tool") return;
    if (!agent) {
      agent = { id, role: "agent", steps: [], text: "", live: false };
      out.push(agent);
    }
    if (r.timestamp) t1 = Math.max(t1 ?? 0, r.timestamp);
    if (r.role === "tool") {
      const name = r.name ?? "tool";
      agent.steps.push({ id: r.tool_call_id ?? id, kind: toolKind(name), name, target: ptPreview(r.context ?? argsPreview(r.args)), dur: "", status: "ok", output: toolOutput(r.text ?? r.content ?? ""), args: r.args ?? null });
    } else {
      const think = typeof r.reasoning === "string" ? r.reasoning.trim() : "";
      if (think) agent.reasoning = agent.reasoning ? agent.reasoning + "\n\n" + think : think;
      if (r.text) agent.text = agent.text ? agent.text + "\n\n" + r.text : r.text;
    }
  });
  close(true);
  // Terminou numa pergunta sem resposta (e sem turno rodando): também fica marcado.
  if (out.length && out[out.length - 1].role === "user" && !o.running) out.push({ id: "end-i", role: "agent", steps: [], text: "", live: false, interrupted: true });
  return out;
}

/** Turno que falhou antes de gravar resposta: o gateway guarda o erro na sessão ("inflight"). */
export function withInflightError(messages: ChatMessage[], fl: { user?: string; error?: string | null; error_surface?: Record<string, unknown> | null }, model?: string) {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (fl.user && (lastUser as { text?: string } | undefined)?.text !== fl.user) messages.push({ id: "fl-u", role: "user", text: fl.user });
  const err = classifyError(String(fl.error), { code: (fl.error_surface as { code?: string } | null)?.code, model });
  const tail = messages[messages.length - 1];
  if (tail?.role === "agent" && !tail.text && !tail.error) Object.assign(tail, { error: err, interrupted: false });
  else if (!(tail?.role === "agent" && tail.error)) messages.push({ id: "fl-e", role: "agent", steps: [], text: "", live: false, error: err });
}

/** Info da sessão do gateway → o que o painel guarda. Só preenche o que o gateway de fato informou. */
export function infoFromLive(i?: Partial<SessionLiveInfo> | null): Partial<SessionInfo> {
  if (!i) return {};
  const o: Partial<SessionInfo> = {};
  if (i.model) o.model = i.model;
  if (i.provider) o.provider = i.provider;
  if (typeof i.reasoning_effort === "string") o.effort = i.reasoning_effort;
  if (typeof i.fast === "boolean") o.fast = i.fast;
  if (i.title) o.title = i.title;
  if (i.terminal_backend) o.backend = i.terminal_backend;
  if (i.personality) o.persona = i.personality;
  const u = i.usage;
  if (u) {
    o.usage = usageOf(u);
    o.cost = costOf(u);
    if (u.context_used != null) o.ctxUsed = u.context_used;
    if (u.context_max) o.ctxMax = u.context_max;
  }
  return o;
}

const fromUsage = (u?: Usage | null): Partial<SessionInfo> => (u ? { ctxUsed: u.context_used ?? null, ...(u.context_max ? { ctxMax: u.context_max } : {}), cost: costOf(u), usage: usageOf(u), ...(u.model ? { model: u.model } : {}) } : {});

export const fromLiveInfo = (i?: SessionLiveInfo | null): SessionInfo => ({
  model: "",
  backend: "local",
  persona: "padrão",
  ctxUsed: null,
  ctxMax: 0,
  cost: null,
  ...infoFromLive(i),
});

function group(startedAt?: number | null): Session["group"] {
  const days = startedAt ? (Date.now() / 1000 - startedAt) / 86400 : 99;
  return days < 1 ? "Hoje" : days < 2 ? "Ontem" : days < 7 ? "Esta semana" : "Mais antigas";
}

let defaultsCache: { key: string; at: number; p: Promise<Record<string, unknown> | null> } | null = null;

const msgOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** `/comando`: o gateway decide se vira texto na tela, um pedido ao agente (skills, /retry…) ou texto de volta ao campo. */
async function slashExec(sessionId: string, input: string): Promise<SlashResult> {
  try {
    const sid = await liveId(sessionId);
    const r = await call("slash.exec", { session_id: sid, command: input.replace(/^\//, "") });
    if ((r.type === "send" || r.type === "skill") && r.message) return { type: "send", message: r.message };
    if (r.type === "prefill") return { type: "prefill", message: r.message ?? "", notice: r.notice ?? "" };
    return { type: "output", output: r.output ?? r.notice ?? r.message ?? "", warning: r.warning ?? undefined };
  } catch (e) {
    return { type: "error", message: msgOf(e) };
  }
}

export const gatewayChat: ChatAdapter = {
  async sessions() {
    const { sessions } = await call("session.list", { limit: 30, profile: profile() });
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
    const r = await call("session.create", { source: "web", profile: profile() });
    live.set(r.stored_session_id, r.session_id);
    usageBase.set(r.session_id, 0);
    return r.stored_session_id;
  },

  async history(sessionId) {
    if (!sessionId) {
      const m = await api.getModelInfo();
      return { messages: [], info: { ...fromLiveInfo(null), model: m.model, ctxMax: m.effective_context_length } };
    }
    // O resume omite a saída das ferramentas; o histórico REST tem, ligada pelo tool_call_id.
    const [r, m, full] = await Promise.all([
      call("session.resume", { session_id: sessionId, profile: profile() }),
      api.getModelInfo().catch(() => null),
      api.getSessionMessages(sessionId).catch(() => null),
    ]);
    live.set(sessionId, r.session_id);
    const outputs = new Map<string, unknown>();
    for (const x of (full?.messages ?? []) as { role?: string; tool_call_id?: string | null; content?: unknown }[]) if (x.role === "tool" && x.tool_call_id && x.content != null) outputs.set(x.tool_call_id, x.content);
    const rows = (r.messages ?? []).map((x) => (x.role === "tool" && x.tool_call_id && outputs.has(x.tool_call_id) && x.content == null ? { ...x, content: outputs.get(x.tool_call_id) } : x));
    const info = fromLiveInfo(r.info);
    const model = info.model || m?.model || "";
    const messages = fromTranscript(rows, { model, running: !!r.running });
    if (r.inflight?.error && !r.running) withInflightError(messages, r.inflight, model);
    // Contadores da sessão (tokens, custo, contexto): o resume de sessão "preguiçosa" não manda.
    const u = await call("session.usage", { session_id: r.session_id }).catch(() => null);
    if (u) usageBase.set(r.session_id, usageOf(u)?.total ?? 0);
    const merged: SessionInfo = { ...info, model, ...(u ? fromUsage(u) : {}) };
    if (!merged.ctxMax) merged.ctxMax = m?.effective_context_length || 0;
    return { messages, info: merged };
  },

  async send(sessionId, prompt, on, opts: SendOpts = {}) {
    const sid = await liveId(sessionId);
    const c = await client();
    const t0 = Date.now();
    const started = new Map<string, ToolStep>();
    const rpcToApproval = new Map<string, string>();
    let gotText = false;
    let gotThink = false;
    return new Promise<void>((resolve, reject) => {
      const offs = [
        // Comando perigoso etc.: o gateway pergunta e espera a resposta (requisição servidor→cliente).
        c.onRequest((req) => {
          if (req.method !== "approval" || req.params.session_id !== sid) return false;
          const p = req.params as { request_id?: string; command?: string; description?: string; choices?: ApprovalChoice[]; allow_permanent?: boolean | null; allow_session?: boolean | null; tool_name?: string | null };
          rpcToApproval.set(req.id, p.request_id ?? req.id);
          const choices: ApprovalChoice[] = p.choices?.length ? p.choices : ["once", ...(p.allow_session ? (["session"] as const) : []), ...(p.allow_permanent ? (["always"] as const) : []), "deny"];
          on({
            type: "approval",
            approval: {
              id: p.request_id ?? req.id,
              command: p.command ?? "",
              description: p.description ?? "",
              choices,
              tool: p.tool_name ?? undefined,
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
          const step: ToolStep = { id: p.tool_id, kind: toolKind(p.name), name: p.name, target: ptPreview(summarizeArgs(p.name, p.args) || p.preview || p.context || p.args_text || argsPreview(p.args)), dur: "", status: "run", output: "", args: p.args ?? null, startedAt: Date.now() };
          started.set(p.tool_id, step);
          on({ type: "step", step });
        }),
        c.on("tool.complete", (e) => {
          if (e.session_id !== sid || !e.payload) return;
          const p = e.payload;
          const base = started.get(p.tool_id) ?? { id: p.tool_id, kind: toolKind(p.name), name: p.name, target: argsPreview(p.args), dur: "", status: "run" as const, output: "", args: p.args ?? null };
          const raw = p.result_text ?? p.summary ?? p.result ?? "";
          on({ type: "step", step: { ...base, status: toolFailed(raw) ? "err" : "ok", dur: fmtDur(p.duration_s), output: toolOutput(raw) } });
        }),
        c.on("message.delta", (e) => {
          if (e.session_id === sid && e.payload?.text) {
            gotText = true;
            on({ type: "delta", text: e.payload.text });
          }
        }),
        // Raciocínio do modelo (só chega com "mostrar pensamento" ligado). `thinking.delta` é o texto do
        // indicador de espera ("pensando…"), não o raciocínio — por isso não entra no bloco "Pensamento".
        c.on("reasoning.delta", (e) => {
          if (e.session_id === sid && e.payload?.text) {
            gotThink = true;
            on({ type: "reasoning", text: e.payload.text });
          }
        }),
        c.on("reasoning.available", (e) => {
          if (e.session_id === sid && e.payload?.text) {
            gotThink = true;
            on({ type: "reasoning", text: e.payload.text, full: true });
          }
        }),
        // Conexão caiu no meio do turno (painel reiniciou, rede): avisa e libera a conversa em vez de girar para sempre.
        c.onState((s) => {
          if (s !== "closed" && s !== "error") return;
          live.clear(); // ids vivos morrem com a conexão; o próximo envio retoma a sessão salva
          on({ type: "error", message: "A conexão com o Hermes caiu no meio da resposta. Mande de novo para continuar.", code: "timeout" });
          done();
        }),
        c.on("message.complete", (e) => {
          if (e.session_id !== sid) return;
          const p = e.payload ?? {};
          const surface = p.error_surface as { code?: string; retryable?: boolean; model?: string } | null | undefined;
          if (p.status === "error") on({ type: "error", message: text(p.error) || "O agente falhou nesse turno", code: surface?.code, retryable: surface?.retryable, model: surface?.model });
          else if (p.status === "interrupted") on({ type: "interrupted" });
          else {
            // Provedor sem streaming: o texto vem só aqui. O raciocínio final também (mesmo sem "mostrar pensamento").
            if (!gotText && typeof p.text === "string" && p.text) on({ type: "delta", text: p.text });
            if (!gotThink && typeof p.reasoning === "string" && p.reasoning.trim()) on({ type: "reasoning", text: p.reasoning.trim(), full: true });
            const stat = turnStat(p.usage, (Date.now() - t0) / 1000, usageBase.get(sid));
            const us = usageOf(p.usage);
            if (us) usageBase.set(sid, us.total);
            on({ type: "done", stat, info: fromUsage(p.usage) });
          }
          done();
        }),
      ];
      const done = () => {
        offs.forEach((off) => off());
        resolve();
      };
      const params: RpcMethods["prompt.submit"]["params"] = { session_id: sid, text: prompt };
      if (opts.truncateFrom != null) Object.assign(params, { truncate_before_row_id: opts.truncateFrom, confirm_truncate: true });
      call("prompt.submit", params).then(
        (r) => typeof r?.user_row_id === "number" && on({ type: "submitted", rowId: r.user_row_id }),
        (err) => {
          offs.forEach((off) => off());
          reject(err);
        },
      );
    });
  },

  slash: slashExec,

  async interrupt(sessionId) {
    const id = live.get(sessionId);
    if (id) await call("session.interrupt", { session_id: id });
  },

  async setModel(sessionId, provider, model): Promise<ModelSwitch> {
    const id = sessionId ? live.get(sessionId) : undefined;
    if (!id) {
      // Conversa nova: troca o padrão do agente (mesma rota das Configurações).
      const body = { scope: "main" as const, provider, model };
      const r = (await api.setModelAssignment(body)) as { confirm_required?: boolean; message?: string };
      if (r.confirm_required) {
        if (!(await ask({ title: "Este modelo é caro", body: r.message ?? "Cada resposta custa mais que o normal.", confirm: "Usar mesmo assim" }))) throw new Error("Troca de modelo cancelada");
        await api.setModelAssignment({ ...body, confirm_expensive_model: true });
      }
      return { state: "default", model, provider };
    }
    const value = `${model} --provider ${provider}`;
    let r = await call("config.set", { session_id: id, key: "model", value });
    if (r.confirm_required) {
      if (!(await ask({ title: "Este modelo é caro", body: r.confirm_message ?? "Cada resposta custa mais que o normal.", confirm: "Usar mesmo assim" }))) throw new Error("Troca de modelo cancelada");
      r = await call("config.set", { session_id: id, key: "model", value, confirm_expensive_model: true });
    }
    // O modelo que o gateway diz ter ficado (não o que pedimos): aliases e correções chegam aqui.
    const real = r.info?.model || (typeof r.value === "string" && r.value) || model;
    return { state: r.deferred ? "pending" : "applied", model: real, provider: r.info?.provider || provider, warning: r.warning || undefined };
  },

  async setReasoning(sessionId, effort) {
    const id = sessionId ? live.get(sessionId) : undefined;
    await call("config.set", { key: "reasoning", value: effort, ...(id ? { session_id: id } : {}) });
  },

  async setFast(sessionId, on) {
    const r = await call("config.set", { session_id: await liveId(sessionId), key: "fast", value: on ? "fast" : "normal" });
    return r.value === "fast" || r.value === "ultrafast" || r.value === "auto" || r.value === "cold";
  },

  async setShowReasoning(sessionId, show) {
    const id = sessionId ? live.get(sessionId) : undefined;
    await call("config.set", { key: "reasoning", value: show ? "show" : "hide", ...(id ? { session_id: id } : {}) });
  },

  async defaults() {
    // A tela pede ao montar e de novo quando o histórico chega: uma leitura só a cada poucos segundos.
    if (!defaultsCache || defaultsCache.key !== (profile() ?? "") || Date.now() - defaultsCache.at > 8000) defaultsCache = { key: profile() ?? "", at: Date.now(), p: api.getConfig(profile()).catch(() => null) };
    const cfg = await defaultsCache.p;
    const sh = (cfg?.display as Record<string, unknown> | undefined)?.show_reasoning;
    return { effort: normalizeEffort(((cfg?.agent as Record<string, unknown> | undefined) ?? {}).reasoning_effort), showReasoning: typeof sh === "boolean" ? sh : null };
  },

  async info(sessionId) {
    const id = await liveId(sessionId);
    const r = await call("session.activate", { session_id: id, omit_messages: true });
    return infoFromLive(r.info);
  },

  watch(storedId, on) {
    let dead = false;
    let offs: (() => void)[] = [];
    (async () => {
      const sid = await liveId(storedId);
      const c = await client();
      if (dead) return;
      offs = [
        c.on("session.info", (e) => {
          if (e.session_id === sid && e.payload) on({ type: "info", info: infoFromLive(e.payload) });
        }),
        // O título automático chega com o id guardado da sessão.
        c.on("session.title", (e) => {
          if ((e.payload?.session_id === storedId || e.session_id === sid) && e.payload?.title) on({ type: "title", title: e.payload.title });
        }),
        c.on("session.usage", (e) => {
          const u = usageOf(e.payload?.usage);
          if (e.session_id === sid && u) on({ type: "usage", usage: u, ctxUsed: e.payload?.usage.context_used ?? null, ctxMax: e.payload?.usage.context_max ?? 0 });
        }),
        c.on("error", (e) => {
          if (e.session_id === sid && e.payload?.message) on({ type: "error", message: e.payload.message });
        }),
      ];
    })().catch(() => {});
    return () => {
      dead = true;
      offs.forEach((f) => f());
    };
  },

  async rename(sessionId, title) {
    const r = await call("session.title", { session_id: await liveId(sessionId), title });
    return r.title || title;
  },

  async undo(sessionId) {
    const r = await slashExec(sessionId, "/undo");
    if (r.type === "prefill") return { removed: Number(r.notice.match(/Undid (\d+)/i)?.[1] ?? 1), text: r.message };
    throw new Error(r.type === "error" ? r.message : "Não consegui desfazer");
  },

  async usage(sessionId) {
    const u = await call("session.usage", { session_id: await liveId(sessionId) }).catch(() => null);
    const us = usageOf(u);
    return u && us ? { usage: us, ctxUsed: u.context_used ?? null, ctxMax: u.context_max ?? 0 } : null;
  },

  async breakdown(sessionId) {
    const b = await call("session.context_breakdown", { session_id: await liveId(sessionId) }).catch(() => null);
    return b ? { parts: b.categories.map((c) => ({ id: c.id, label: c.label, tokens: c.tokens })), used: b.context_used, max: b.context_max, estimated: b.context_estimated } : null;
  },

  async attach(sessionId, file, kind) {
    const session_id = await liveId(sessionId);
    const data = await fileToDataUrl(file);
    if (kind === "image") {
      const r = await call("image.attach_bytes", { session_id, content_base64: data, filename: file.name });
      if (!r.attached) throw new Error(r.message || "Não consegui anexar a imagem");
      return { paths: r.path ? [r.path] : [] };
    }
    if (kind === "pdf") {
      const r = await call("pdf.attach", { session_id, content_base64: data, filename: file.name });
      if (!r.attached) throw new Error("Não consegui anexar o PDF");
      return { paths: r.pages.map((p) => p.path) };
    }
    const r = await call("file.attach", { session_id, data_url: data, name: file.name });
    if (!r.attached) throw new Error("Não consegui anexar o arquivo");
    return { paths: [], ref: r.ref_text };
  },

  async detach(sessionId, paths) {
    const session_id = live.get(sessionId);
    if (!session_id) return;
    await Promise.all(paths.map((path) => call("image.detach", { session_id, path }).catch(() => {})));
  },

  async release(sessionId) {
    const id = live.get(sessionId);
    if (!id) return;
    live.delete(sessionId);
    await call("session.close", { session_id: id }).catch(() => {});
  },

  async slashCommands() {
    return buildSlashMenu(await call("commands.catalog", { profile: profile() }));
  },
};
