// Telas do agente ligadas ao backend real (mesmas rotas do dashboard antigo).
import { api, fetchJSON, type CronJob as ApiCron } from "@/lib/api";
import { classifyLine } from "@/lib/log-classify";
import { parseCronPt } from "./cron";
const DEST_ICON: Record<string, string> = { Telegram: "send", Email: "mail", Discord: "message-circle", WhatsApp: "phone", Slack: "hash", Conversa: "message-square" };
import type { AgentAdapter, CronJob, Gateway, LogLine, MemoryData, Settings } from "./types";

const jsonInit = (method: string, body: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const SOURCE_ICON: Record<string, string> = { telegram: "send", discord: "message-circle", whatsapp: "phone", cron: "calendar-clock", cli: "square-terminal", tui: "square-terminal", web: "globe" };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const when = (ts?: number | null) => (ts ? new Date(ts * 1000).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

const BACKENDS = [
  { id: "local", name: "Local", description: "Na sua máquina" },
  { id: "docker", name: "Docker", description: "Contêiner isolado" },
  { id: "ssh", name: "SSH", description: "Servidor remoto" },
  { id: "singularity", name: "Singularity", description: "Clusters HPC" },
  { id: "modal", name: "Modal", description: "Serverless, hiberna" },
  { id: "daytona", name: "Daytona", description: "Serverless, persistente" },
  { id: "vercel_sandbox", name: "Vercel Sandbox", description: "Efêmero" },
];

// Personalidades nativas do Hermes (hermes_cli/personality.py) com rótulo em português.
const PERSONAS: [string, string][] = [
  ["", "Padrão"],
  ["helpful", "Prestativo"],
  ["concise", "Conciso"],
  ["technical", "Técnico"],
  ["teacher", "Didático"],
  ["creative", "Criativo"],
];

const TOOL_ICON: Record<string, string> = { terminal: "square-terminal", web: "globe", browser: "app-window", vision: "eye", image_gen: "image", tts: "audio-lines", delegation: "git-fork", mcp: "plug", memory: "brain", file: "file-text", cronjob: "calendar-clock" };

const GW_STATUS: Record<string, Gateway["status"]> = { connected: "conectado", pending_restart: "pareando", disconnected: "erro", startup_failed: "erro", fatal: "erro" };

function cronFrom(j: ApiCron): CronJob {
  const dest = cap(String(j.deliver ?? "") || "Conversa");
  return {
    id: j.id,
    title: j.name || j.prompt?.slice(0, 60) || "Sem nome",
    human: j.schedule_display ?? j.schedule?.display ?? "",
    expr: j.schedule?.expr ?? "",
    next: j.next_run_at ? new Date(j.next_run_at).toLocaleString("pt-BR", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—",
    dest,
    destIcon: DEST_ICON[dest] ?? "message-square",
    enabled: j.enabled,
    profile: j.profile ?? undefined,
  };
}

/** "2026-10-07 14:03:11,512 INFO gateway.run: texto" → LogLine (formatos desconhecidos viram só a mensagem). */
export function logFrom(raw: string, i: number): LogLine {
  const m = raw.match(/(\d{2}:\d{2}:\d{2})[,.\d]*\s+(?:-\s+)?([A-Z]+)\s+(?:-\s+)?([\w.\-]+?):?\s+(?:-\s+)?(.*)$/);
  const cls = classifyLine(raw);
  const level = /tool|terminal|web_search|delegate/i.test(raw) && cls === "info" ? "TOOL" : cls === "error" ? "ERRO" : cls === "warning" ? "WARN" : "INFO";
  return m ? { id: String(i), t: m[1], level, src: m[3].split(".").pop()!, msg: m[4] } : { id: String(i), t: "", level, src: "", msg: raw };
}

export const liveAgent: AgentAdapter = {
  async sessions(query, source) {
    const opts = { source: source === "Todas" ? null : source.toLowerCase(), order: "recent" as const };
    const rows = query.trim() ? (await api.searchSessions(query, opts)).results.map((r) => ({ ...r, id: r.session_id ?? r.id, preview: r.snippet || r.preview })) : (await api.getSessions(50, 0, opts)).sessions;
    return rows.map((s) => ({ id: s.id, title: s.title || s.preview || "Sem título", source: cap(s.source ?? "web"), icon: SOURCE_ICON[s.source ?? ""] ?? "globe", snippet: (s.preview ?? "").replace(/>>>|<<</g, ""), msgs: s.message_count ?? 0, when: when(s.started_at) }));
  },

  memory: () => fetchJSON<MemoryData>("/api/ops/memory"),
  addMemory: (target, content) => fetchJSON<MemoryData>("/api/ops/memory", jsonInit("POST", { target, content })),
  editMemory: (target, entry, content) => fetchJSON<MemoryData>("/api/ops/memory", jsonInit("PUT", { target, entry, content })),
  removeMemory: (target, entry) => fetchJSON<MemoryData>("/api/ops/memory", jsonInit("DELETE", { target, entry })),

  async skills() {
    return (await api.getSkills()).map((s) => {
      const cat = (s.category ?? "").toLowerCase();
      return { name: s.name, origin: cat.includes("hub") ? "hub" : /learn|auto|aprend/.test(cat) ? "aprendida" : "sua", description: s.description, uses: 0, version: "", updated: s.category ?? "" } as const;
    });
  },

  crons: async () => (await api.getCronJobs()).map(cronFrom),
  toggleCron: async (c) => {
    await (c.enabled ? api.pauseCronJob(c.id, c.profile) : api.resumeCronJob(c.id, c.profile));
  },
  previewCron: parseCronPt,
  async createCron(text) {
    const p = parseCronPt(text);
    if (!p) throw new Error("Não entendi quando rodar — diga, por exemplo, “toda sexta às 18h”.");
    const job = await api.createCronJob({ name: p.prompt.slice(0, 60), prompt: p.prompt, schedule: p.expr, deliver: p.dest === "Conversa" ? undefined : p.dest.toLowerCase() });
    return { ...cronFrom(job), human: job.schedule_display ?? p.human };
  },

  // ponytail: subagent.list é por sessão (RPC); sem lista global ainda, a tela mostra o estado vazio.
  subagents: async () => ({ running: [], done: [] }),

  async gateways() {
    const [{ platforms }, st] = await Promise.all([api.getMessagingPlatforms(), api.getStatus()]);
    return {
      summary: { running: st.gateway_running, label: st.gateway_running ? `gateway ativo${st.gateway_pid ? " · pid " + st.gateway_pid : ""}` : "gateway parado" },
      items: platforms.map((p) => ({
        id: p.id,
        name: p.name,
        mono: p.name.slice(0, p.name === "Signal" ? 2 : 1),
        account: p.home_channel?.name ?? (p.configured ? "configurado" : "não configurado"),
        enabled: p.enabled,
        status: p.enabled ? (GW_STATUS[p.state] ?? (p.state === "gateway_stopped" ? "erro" : "pareando")) : "desligado",
        stat: p.error_message ?? (p.state === "gateway_stopped" ? "gateway parado" : ""),
      })),
    };
  },
  toggleGateway: async (g) => {
    await api.updateMessagingPlatform(g.id, { enabled: !g.enabled });
  },

  logs: async () => (await api.getLogs({ lines: 200 })).lines.map(logFrom),

  async settings(): Promise<Settings> {
    const [opts, cfg, toolsets] = await Promise.all([api.getModelOptions({}), api.getConfig(), api.getToolsets()]);
    const c = cfg as { terminal?: { backend?: string }; display?: { personality?: string } };
    const backend = c.terminal?.backend ?? "local";
    const persona = PERSONAS.find(([id]) => id === (c.display?.personality ?? ""))?.[1] ?? cap(c.display?.personality ?? "Padrão");
    return {
      providers: opts.providers
        .filter((p) => p.authenticated || p.is_current)
        .map((p) => ({ id: p.slug, name: p.name, description: p.authenticated ? "Conectado" : "Sem credencial", models: p.models?.length ? p.models : (p.featured_models ?? []) })),
      provider: opts.provider ?? "",
      model: opts.model ?? "",
      backends: BACKENDS.some((b) => b.id === backend) ? BACKENDS : [...BACKENDS, { id: backend, name: backend, description: "atual" }],
      backend,
      personas: PERSONAS.map(([, label]) => label),
      persona,
      tools: toolsets.map((t) => ({ id: t.name, name: t.label || t.name, description: t.description, icon: TOOL_ICON[t.name] ?? "wrench", enabled: t.enabled })),
    };
  },

  async saveSettings(patch) {
    if (patch.provider && patch.model) {
      const body = { scope: "main" as const, provider: patch.provider, model: patch.model };
      const r = (await api.setModelAssignment(body)) as { confirm_required?: boolean; message?: string };
      if (r.confirm_required) {
        if (!window.confirm(r.message ?? "Este modelo é caro. Usar mesmo assim?")) throw new Error("Troca de modelo cancelada");
        await api.setModelAssignment({ ...body, confirm_expensive_model: true });
      }
    }
    if (patch.backend || patch.persona) {
      const cfg = structuredClone(await api.getConfig()) as Record<string, Record<string, unknown>>;
      if (patch.backend) cfg.terminal = { ...cfg.terminal, backend: patch.backend };
      if (patch.persona) cfg.display = { ...cfg.display, personality: PERSONAS.find(([, l]) => l === patch.persona)?.[0] ?? patch.persona.toLowerCase() };
      await api.saveConfig(cfg);
    }
    if (patch.tool) await api.toggleToolset(patch.tool.id, patch.tool.enabled);
  },
};
