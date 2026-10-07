// Adapter real: liga ao backend o que já existe e mantém os mocks no resto.
// Hoje: kill switch (/api/estop, mesmo sentinel de `hermes pause`), saúde do gateway (/api/status)
// e custo do mês (/api/analytics/usage). Inbox, aprovações globais, autonomia por canal, briefing,
// custo por negócio e Atividade ainda não têm backend — seguem com os dados do protótipo.
import { api, fetchJSON, type StatusResponse } from "@/lib/api";
import type { Costs, Health, OpsAdapter } from "./adapter";
import { mockAdapter } from "./mock";

type Estop = { paused: boolean; reason: string | null; engaged_at: string | null };

const getEstop = () => fetchJSON<Estop>("/api/estop");

const OK = new Set(["connected", "running", "ready", "ok"]);

export function healthFrom(st: StatusResponse): Health {
  const items = Object.entries(st.gateway_platforms ?? {}).map(([name, p]) => ({
    name: name[0].toUpperCase() + name.slice(1),
    status: OK.has(p.state) ? ("ok" as const) : p.error_code ? ("err" as const) : ("warn" as const),
    value: p.error_message ? "erro" : p.state === "connected" ? "conectado" : p.state,
  }));
  return { online: st.gateway_running, uptime: st.gateway_running ? "gateway ativo" : "gateway parado", items, responseTime: "—" };
}

async function costsThisMonth(): Promise<Costs> {
  const now = new Date();
  const a = await api.getAnalytics(now.getDate());
  return {
    month: now.toLocaleDateString("pt-BR", { month: "long" }),
    total: a.totals.total_actual_cost || a.totals.total_estimated_cost,
    limit: null,
    projection: null,
    byBusiness: [],
  };
}

export const liveAdapter: OpsAdapter = {
  ...mockAdapter,
  async load() {
    const [snap, estop, status, costs] = await Promise.all([mockAdapter.load(), getEstop(), api.getStatus(), costsThisMonth()]);
    return { ...snap, paused: estop.paused, health: healthFrom(status), costs };
  },
  async getPaused() {
    return (await getEstop()).paused;
  },
  async setPaused(paused) {
    await fetchJSON<Estop>("/api/estop", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
  },
};
