import { beforeEach, describe, expect, it, vi } from "vitest";

// Backend falso: só o que o kill switch e a Atividade usam.
const backend = vi.hoisted(() => ({ paused: false, performed: 0 }));
vi.mock("./adapter", () => ({
  adapter: {
    getPaused: async () => backend.paused,
    setPaused: async (p: boolean) => {
      backend.paused = p;
    },
    perform: async (a: { business: string; kind: string; action: string; why: string }) => {
      backend.performed++;
      return { id: "1", at: "10:00", business: a.business, kind: a.kind, action: a.action, why: a.why, reversible: false, undone: false };
    },
  },
}));
vi.mock("./chat", () => ({ chat: { sessions: async () => [] } }));

const { actOnBehalf, getState, refreshPaused, setState, togglePause } = await import("./store");

const send = { business: "b1", kind: "msg" as const, action: "Respondeu Maria", why: "teste", done: "Enviado", target: { kind: "reply" as const, id: "i1", text: "oi" } };

beforeEach(() => {
  backend.paused = false;
  backend.performed = 0;
});

describe("actOnBehalf", () => {
  it("bloqueia quando pausado: não chama o backend, sem Atividade, toast de bloqueio", async () => {
    setState({ paused: true, activity: [] });
    expect(await actOnBehalf(send)).toBe(false);
    expect(backend.performed).toBe(0);
    expect(getState().activity).toHaveLength(0);
    expect(getState().toast?.text).toMatch(/pausado/);
  });

  it("executa quando ativo: registra na Atividade e avisa", async () => {
    setState({ paused: false, activity: [] });
    expect(await actOnBehalf(send)).toBe(true);
    expect(getState().activity[0]).toMatchObject({ action: "Respondeu Maria", business: "b1" });
    expect(getState().toast?.text).toBe("Enviado");
  });

  it("a sincronização periódica não desfaz uma pausa feita aqui", async () => {
    setState({ paused: false });
    await togglePause();
    await refreshPaused();
    expect(getState().paused).toBe(true);
    await togglePause();
    expect(backend.paused).toBe(false);
  });
});
