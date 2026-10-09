import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ full: 0, lean: 0 }));
vi.mock("./adapter", () => ({
  adapter: {
    load: async () => (calls.full++, { inbox: [{ id: "full" }] }),
    loadLean: async () => (calls.lean++, { inbox: [{ id: "lean" }] }),
  },
}));
vi.mock("./chat", () => ({ chat: { sessions: async () => [] } }));
vi.mock("./permissions/model", () => ({ permissionsApi: { pending: async () => [] } }));

const { ensureFullOps, getState, loadOps, loadOpsOnce, setOpsLean, setState } = await import("./store");

beforeEach(() => {
  calls.full = calls.lean = 0;
  setState({ profileId: "p" + Math.random() });
});

describe("leitura da Central na Conversa", () => {
  it("na Conversa lê só o enxuto; ao sair, completa uma vez", async () => {
    setOpsLean(true);
    await loadOps();
    expect(calls).toEqual({ full: 0, lean: 1 });
    expect(getState().inbox[0]).toMatchObject({ id: "lean" });
    await ensureFullOps();
    await ensureFullOps();
    expect(calls).toEqual({ full: 1, lean: 1 });
  });

  it("chamadas juntas viram uma só e a entrada do app não repete o que o perfil já leu", async () => {
    setOpsLean(true);
    await Promise.all([loadOps(), loadOps()]);
    await loadOpsOnce();
    expect(calls.lean).toBe(1);
    setOpsLean(false);
    await loadOpsOnce();
    expect(calls.full).toBe(1);
  });
});
