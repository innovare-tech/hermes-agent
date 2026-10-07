// Adapter real: liga ao backend o que já existe e mantém os mocks no resto.
// Hoje: kill switch (/api/estop, mesmo sentinel de `hermes pause`). Inbox, aprovações globais e
// autonomia por canal ainda não têm backend — seguem com os dados do protótipo.
import { fetchJSON } from "@/lib/api";
import type { OpsAdapter } from "./adapter";
import { mockAdapter } from "./mock";

type Estop = { paused: boolean; reason: string | null; engaged_at: string | null };

const getEstop = () => fetchJSON<Estop>("/api/estop");

export const liveAdapter: OpsAdapter = {
  ...mockAdapter,
  async load() {
    const [snap, estop] = await Promise.all([mockAdapter.load(), getEstop()]);
    return { ...snap, paused: estop.paused };
  },
  async getPaused() {
    return (await getEstop()).paused;
  },
  async setPaused(paused) {
    await fetchJSON<Estop>("/api/estop", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused }) });
  },
};
