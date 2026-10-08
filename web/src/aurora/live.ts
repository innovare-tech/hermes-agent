// Adapter da Central de Operações sobre o backend do Hermes:
// /api/ops/* (ops_center: negócios, canais, caixa, atividade, vigias, pessoas, playbooks),
// /api/estop (kill switch = `hermes pause`), /api/status (saúde) e /api/analytics/usage (custos).
import { api, fetchJSON, type StatusResponse } from "@/lib/api";
import type { PersonHandles } from "./adapter";
import type { Activity, Approval, AutonomyMode, Business, Channel, Costs, Health, InboxItem, OpsAdapter, Person, Playbook, Priority, RadarGroup } from "./adapter";

type Estop = { paused: boolean; reason: string | null; engaged_at: string | null };

// Formato cru de /api/ops (ops_center.store).
type RawChannel = { id: string; platform: string; chat_id: string; name: string; kind: string; business_id: string | null; mode: number; last_seen: number | null };
type RawInbox = { id: number; channel_id: string; sender_id: string | null; sender_name: string | null; text: string; received_at: number; priority: string; summary: string | null; draft: string | null; status: string; sent_at: number | null; platform: string; chat_name: string; kind: string; mode: number; business_id: string | null };
type RawActivity = { id: number; at: number; business_id: string | null; kind: Activity["kind"]; action: string; why: string; reversible: number; undone: number };
type RawPerson = { id: string; name: string; role: string; business_id: string | null; tone: string; channels: string; notes: string; pending: string[]; waiting_since: number | null; handles?: PersonHandles };
type RawPlaybook = { id: string; name: string; business_id: string | null; trigger: string; nodes: Playbook["nodes"]; enabled: boolean; runs: number; last_run: number | null; schedule: string; deliver: string; next_run: number | null; last_error: string | null; trigger_kind?: string; keywords?: string; channel_id?: string | null };

const MODES = ["Observar", "Rascunhar", "Autônomo", "Escutar"];
const PLATFORM_ICON: Record<string, string> = { telegram: "send", whatsapp: "phone", discord: "message-circle", email: "mail", slack: "hash", signal: "message-square", api: "plug" };
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ops = <T>(path: string, init?: RequestInit) => fetchJSON<T>("/api/ops" + path, init);

/** Hora do dia para hoje, "ontem" ou a data curta. */
export function whenLabel(ts: number | null | undefined): string {
  if (!ts) return "";
  const d = new Date(ts * 1000);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400000);
  if (days <= 0) return d.toTimeString().slice(0, 5);
  if (days === 1) return "ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/** Avisos graves da última hora no log → problemas do Painel (o resto fica só em Logs). */
export function severeFromLogs(lines: string[], now = Date.now()): { text: string; to: string }[] {
  const out = new Map<string, { text: string; to: string }>();
  for (const l of lines) {
    const ts = l.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/);
    if (!ts || now - new Date(`${ts[1]}T${ts[2]}`).getTime() > 3600_000) continue;
    const stall = l.match(/event loop stalled ([\d.]+)s/);
    if (stall) out.set("stall", { text: `O painel ficou travado por ${Math.round(Number(stall[1]) / 60)} min na última hora`, to: "/logs" });
    else if (/startup_failed|adapter .*failed|fatal/i.test(l)) out.set("adapter", { text: "Um canal falhou ao iniciar — veja os detalhes em Logs", to: "/logs" });
  }
  return [...out.values()];
}

export function healthFrom(st: StatusResponse, platforms: { name: string; enabled: boolean; configured: boolean; error_message?: string | null }[] = [], logs: string[] = []): Health {
  const items = Object.entries(st.gateway_platforms ?? {}).map(([name, p]) => ({
    name: name[0].toUpperCase() + name.slice(1),
    status: ["connected", "running", "ready", "ok"].includes(p.state) ? ("ok" as const) : p.error_code ? ("err" as const) : ("warn" as const),
    value: p.error_message ? "erro" : p.state === "connected" ? "conectado" : p.state,
  }));
  // O agente responde (este endpoint respondeu); o gateway de mensagens é um item à parte.
  const gateway = { name: "Gateway de mensagens", status: st.gateway_running ? ("ok" as const) : ("warn" as const), value: st.gateway_running ? "ativo" : "parado" };
  const version = st.version && st.version !== "unknown" ? "v" + st.version : "";
  const live = platforms.filter((p) => p.enabled && p.configured);
  const problems = [
    ...(live.length && !st.gateway_running ? [{ text: `Gateway parado com ${live.length === 1 ? "1 canal ligado" : live.length + " canais ligados"} — ninguém recebe resposta`, to: "/gateways" }] : []),
    ...live.filter((p) => p.error_message).map((p) => ({ text: `${p.name}: ${p.error_message}`, to: "/gateways" })),
    ...severeFromLogs(logs),
  ];
  return { online: true, level: problems.length ? "warn" : "ok", problems, uptime: version, items: [gateway, ...items], responseTime: "—" };
}

async function costsThisMonth(): Promise<Costs> {
  const now = new Date();
  const a = await api.getAnalytics(now.getDate());
  return { month: now.toLocaleDateString("pt-BR", { month: "long" }), total: a.totals.total_actual_cost || a.totals.total_estimated_cost, limit: null, projection: null, byBusiness: [] };
}

export const channelFrom = (c: RawChannel): Channel => ({
  id: c.id,
  name: c.name || `${cap(c.platform)} · ${c.chat_id}`,
  icon: c.kind === "group" ? "users" : (PLATFORM_ICON[c.platform] ?? "message-square"),
  platform: cap(c.platform),
  kind: c.kind,
  business: c.business_id ?? "",
  mode: (c.mode as AutonomyMode) ?? 2,
  lastSeen: whenLabel(c.last_seen),
});

export function inboxFrom(i: RawInbox): InboxItem {
  const from = i.sender_name || i.chat_name || i.channel_id;
  const done = i.status === "sent" || i.status === "auto";
  return {
    id: String(i.id),
    business: i.business_id ?? "",
    channel: cap(i.platform),
    channelId: i.channel_id,
    from: i.kind === "group" && i.chat_name && i.sender_name ? `${i.chat_name} · ${i.sender_name}` : from,
    initials: initials(i.sender_name || i.chat_name || "?"),
    receivedAt: whenLabel(i.received_at),
    priority: (i.status === "auto" ? "resolve" : i.priority) as Priority,
    autonomyMode: MODES[i.mode] ?? "Autônomo",
    summary: i.summary || (i.text.length > 90 ? i.text.slice(0, 88) + "…" : i.text),
    message: i.text,
    suggestedReply: i.draft ?? "",
    sentAt: done ? (i.sent_at ? `Enviado sozinho às ${whenLabel(i.sent_at)}` : "Respondido pelo Hermes") : undefined,
    context: [],
  };
}

/** Rascunhos do modo Rascunhar viram aprovações (aprovar = enviar). */
const approvalFrom = (i: InboxItem): Approval => ({
  id: "draft-" + i.id,
  inboxId: i.id,
  business: i.business,
  kind: "mensagem",
  icon: "message-square",
  title: `Responder ${i.from}`,
  risk: "baixo",
  createdAt: i.receivedAt,
  why: `Canal em modo Rascunhar. Mensagem: “${i.summary}”`,
  preview: i.suggestedReply,
  source: `${i.channel} · rascunho do Hermes`,
});

export const activityFrom = (a: RawActivity): Activity => ({ id: String(a.id), at: whenLabel(a.at), business: a.business_id ?? "", kind: a.kind, action: a.action, why: a.why, reversible: !!a.reversible, undone: !!a.undone });

const personFrom = (p: RawPerson): Person => ({
  id: p.id,
  name: p.name,
  initials: initials(p.name),
  role: p.role,
  business: p.business_id ?? "",
  waitingHours: p.waiting_since ? Math.floor((Date.now() / 1000 - p.waiting_since) / 3600) : 0,
  lastTopic: p.notes,
  tone: p.tone,
  channels: p.channels,
  pending: p.pending,
  handles: p.handles ?? {},
});

const playbookFrom = (p: RawPlaybook): Playbook => ({
  id: p.id,
  name: p.name,
  business: p.business_id ?? "",
  trigger: p.trigger,
  runs: p.runs,
  enabled: p.enabled,
  lastRun: p.last_run ? whenLabel(p.last_run) : "nunca",
  nodes: p.nodes,
  schedule: p.schedule ?? "",
  deliver: p.deliver || "local",
  nextRun: p.next_run ? whenLabel(p.next_run) : "",
  lastError: p.last_error ?? "",
  triggerKind: (p.trigger_kind as Playbook["triggerKind"]) || (p.schedule ? "schedule" : "manual"),
  keywords: p.keywords ?? "",
  channelId: p.channel_id ?? "",
});

/** Grupos para o Radar: canais de grupo + volume de hoje vindo da caixa de entrada. */
function radarFrom(channels: Channel[], inbox: RawInbox[]): RadarGroup[] {
  const today = new Date().setHours(0, 0, 0, 0) / 1000;
  return channels
    .filter((c) => c.kind === "group")
    .map((c) => {
      const msgs = inbox.filter((i) => i.channel_id === c.id && i.received_at >= today);
      const urgent = msgs.filter((m) => m.priority === "urgente").length;
      return {
        id: c.id,
        business: c.business,
        channel: c.platform,
        name: c.name,
        members: new Set(msgs.map((m) => m.sender_id)).size,
        msgsToday: msgs.length,
        sentiment: [],
        alert: urgent ? `${urgent} ${urgent === 1 ? "mensagem" : "mensagens"} com palavras vigiadas hoje` : undefined,
        decisions: [],
        mentions: [],
        unanswered: [],
      };
    });
}

export const liveAdapter: OpsAdapter = {
  async load() {
    const [estop, status, costs, businesses, channels, inboxRaw, activity, watches, people, playbooks, settings, messaging, warnLogs] = await Promise.all([
      fetchJSON<Estop>("/api/estop"),
      api.getStatus(),
      costsThisMonth(),
      ops<Business[]>("/businesses"),
      ops<RawChannel[]>("/channels"),
      ops<RawInbox[]>("/inbox"),
      ops<RawActivity[]>("/activity"),
      ops<string[]>("/watches"),
      ops<RawPerson[]>("/people"),
      ops<RawPlaybook[]>("/playbooks"),
      ops<{ default_mode: AutonomyMode }>("/settings"),
      api.getMessagingPlatforms().then((r) => r.platforms, () => []),
      api.getLogs({ lines: 300, level: "WARNING" }).then((r) => r.lines, () => [] as string[]),
    ]);
    const inbox = inboxRaw.map(inboxFrom);
    const autonomy = channels.map(channelFrom);
    const today = new Date().setHours(0, 0, 0, 0) / 1000;
    const version = status.version && status.version !== "unknown" ? "v" + status.version : "";
    return {
      account: { plan: "Hermes", credits: "seu agente", home: "~/.hermes", version },
      businesses,
      inbox,
      approvals: inboxRaw.filter((i) => i.status === "drafted" && i.draft).map((i) => approvalFrom(inboxFrom(i))),
      radar: radarFrom(autonomy, inboxRaw),
      tickets: [],
      activity: activity.map(activityFrom),
      autonomy,
      briefing: [],
      last24h: { saved: "", autoReplies: inboxRaw.filter((i) => (i.status === "auto" || i.status === "sent") && i.received_at >= today).length },
      health: healthFrom(status, messaging, warnLogs),
      costs,
      watches,
      support: { firstResponse: "", resolvedByHermes: "", csat: "", kbUsage: "" },
      kb: [],
      people: people.map(personFrom),
      playbooks: playbooks.map(playbookFrom),
      defaultMode: settings.default_mode,
      paused: estop.paused,
    };
  },

  getPaused: async () => (await fetchJSON<Estop>("/api/estop")).paused,
  async setPaused(paused) {
    await fetchJSON<Estop>("/api/estop", json("PUT", { paused }));
  },

  async perform(a) {
    if (a.target.kind === "reply") await ops(`/inbox/${a.target.id}/reply`, json("POST", { text: a.target.text }));
    if (a.target.kind === "ticket") throw new Error("Suporte ainda não conectado a um sistema de tickets");
    let why = a.why;
    if (a.target.kind === "playbook") {
      const r = await ops<{ gateway_running: boolean }>(`/playbooks/${a.target.id}/run`, json("POST"));
      if (!r.gateway_running) why += " Gateway desligado: roda quando ele subir.";
    }
    // approval: a resposta já foi dada ao gateway pela Conversa; aqui só registra.
    const raw = await ops<RawActivity>("/activity", json("POST", { kind: a.kind, action: a.action, why, business_id: a.business || null, reversible: false }));
    return activityFrom(raw);
  },
  async deny(approval) {
    if (approval.inboxId) await ops(`/inbox/${approval.inboxId}`, json("PATCH", { status: "kept" }));
  },
  async archive(id) {
    await ops(`/inbox/${id}`, json("PATCH", { status: "archived" }));
  },
  async keep(id) {
    await ops(`/inbox/${id}`, json("PATCH", { status: "kept", priority: "voce" }));
  },
  async undo(id) {
    await ops(`/activity/${id}/undo`, json("POST"));
  },
  async setDefaultMode(mode) {
    await ops("/settings", json("PUT", { default_mode: mode }));
  },
  async setAutonomy(channelId, mode, confirm) {
    await ops(`/channels/${encodeURIComponent(channelId)}`, json("PUT", { mode, confirm: !!confirm }));
  },
  async setChannelBusiness(channelId, businessId) {
    await ops(`/channels/${encodeURIComponent(channelId)}`, json("PUT", { business_id: businessId }));
  },
  saveBusiness: (b) => (b.id ? ops<Business>(`/businesses/${b.id}`, json("PUT", { name: b.name, color: b.color })) : ops<Business>("/businesses", json("POST", { name: b.name, color: b.color }))),
  async deleteBusiness(id) {
    await ops(`/businesses/${id}`, json("DELETE"));
  },
  async setWatches(words) {
    await ops("/watches", json("PUT", { words }));
  },
  async savePerson(p) {
    const raw = await ops<RawPerson>("/people", json("PUT", { id: p.id, name: p.name, role: p.role, business_id: p.business || null, tone: p.tone, channels: p.channels, notes: p.lastTopic, pending: p.pending, handles: p.handles }));
    return personFrom(raw);
  },
  async deletePerson(id) {
    await ops(`/people/${id}`, json("DELETE"));
  },
  async savePlaybook(p) {
    const raw = await ops<RawPlaybook>("/playbooks", json("PUT", { id: p.id, name: p.name, business_id: p.business || null, trigger: p.trigger, nodes: p.nodes, enabled: p.enabled, schedule: p.triggerKind === "schedule" ? p.schedule : "", deliver: p.deliver, trigger_kind: p.triggerKind, keywords: p.keywords, channel_id: p.channelId || null }));
    return playbookFrom(raw);
  },
  async deletePlaybook(id) {
    await ops(`/playbooks/${id}`, json("DELETE"));
  },
};
