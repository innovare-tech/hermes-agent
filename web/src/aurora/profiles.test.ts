import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Profile } from "./profileLogic";

// Backend e módulos pesados falsos: aqui só interessa o que a troca de perfil faz com a store e com as rotas.
const fake = vi.hoisted(() => ({
  managed: "",
  calls: [] as string[],
  loads: [] as { profile: string; resolve: () => void }[],
  list: [] as unknown[],
  failList: false,
  chatResets: 0,
}));
vi.mock("@/lib/api", () => ({
  api: { deleteProfile: async (id: string) => void fake.calls.push("delete:" + id), setActiveProfile: async () => ({}) },
  fetchJSON: async (url: string) => {
    fake.calls.push(url);
    if (url.startsWith("/api/ops/profiles") && fake.failList) throw new Error("fora do ar");
    return url.startsWith("/api/ops/profiles") ? fake.list : {};
  },
  setManagementProfile: (id: string) => {
    fake.managed = id;
  },
  getManagementProfile: () => fake.managed,
}));
vi.mock("./agent", () => ({ agent: { apiKeys: async () => [{ key: "OPENROUTER_API_KEY", description: "OpenRouter API key", isSet: true }], gatewayAction: async () => {} } }));
vi.mock("./agent/channelText", () => ({ CHANNEL_PT: {} }));
vi.mock("./live", () => ({ PLATFORM_ICON: {} }));
vi.mock("./chat", () => ({ chat: { sessions: async () => [] }, resetChatProfile: () => void fake.chatResets++ }));
vi.mock("./adapter", () => ({
  adapter: {
    // Cada carregamento guarda de qual perfil ele saiu e só termina quando o teste manda.
    load: () => new Promise((resolve) => fake.loads.push({ profile: fake.managed, resolve: () => resolve({ inbox: [{ id: "da-" + fake.managed }] }) })),
  },
}));

const { getState, setState } = await import("./store");
const { deleteProfile, refreshProfiles, switchProfile } = await import("./profiles");

const mk = (id: string, o: Partial<Profile> = {}): Profile => ({ id, name: id, desc: "", color: "violeta", icon: "user", isDefault: false, group: null, channels: [], model: "", provider: "", status: "ok", canPause: true, pausedBy: null, usageToday: { msgs: 0, costUsd: 0 }, ...o });

// O ambiente de teste é Node, sem localStorage: um falso em memória.
const store = new Map<string, string>();
vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), clear: () => store.clear() });

beforeEach(() => {
  fake.managed = "";
  fake.calls = [];
  fake.loads = [];
  fake.failList = false;
  fake.chatResets = 0;
  localStorage.clear();
  fake.list = [mk("default", { isDefault: true }), mk("aibiz"), mk("innovare")];
  setState({ profiles: fake.list as Profile[], profilesStatus: "ready", profileId: "default", switching: false, inbox: [{ id: "antigo" } as never], sessions: [{ id: "s-antiga" } as never], keys: ["Velha"], toasts: [] });
});

describe("trocar de perfil", () => {
  it("aponta as rotas e a conversa para o perfil novo, lembra no navegador e esvazia o que era do anterior", async () => {
    const done = switchProfile("aibiz");
    expect(fake.managed).toBe("aibiz");
    expect(localStorage.getItem("hermes.aurora.profile")).toBe("aibiz");
    expect(fake.chatResets).toBe(1);
    const s = getState();
    expect(s.profileId).toBe("aibiz");
    expect(s.switching).toBe(true);
    expect(s.inbox).toEqual([]); // nada do perfil anterior fica à vista
    expect(s.sessions).toEqual([]);
    expect(s.keys).toEqual([]);
    expect(s.toasts[0]).toMatchObject({ text: "Agora você está no perfil aibiz" });
    await vi.waitFor(() => expect(fake.loads).toHaveLength(1));
    fake.loads[0].resolve();
    await done;
    expect(getState().inbox).toEqual([{ id: "da-aibiz" }]);
    expect(getState().switching).toBe(false);
    expect(getState().keys).toEqual(["OpenRouter"]);
  });

  it("trocar para o perfil que já está em uso, ou que não existe, não faz nada", async () => {
    await switchProfile("default");
    await switchProfile("fantasma");
    expect(fake.managed).toBe("");
    expect(getState().switching).toBe(false);
  });

  it("resposta de um perfil que já não é o atual é descartada (troca no meio do carregamento)", async () => {
    const first = switchProfile("aibiz");
    await vi.waitFor(() => expect(fake.loads).toHaveLength(1));
    const second = switchProfile("innovare");
    await vi.waitFor(() => expect(fake.loads).toHaveLength(2));
    fake.loads[1].resolve(); // innovare chega primeiro
    fake.loads[0].resolve(); // aibiz chega atrasado
    await Promise.all([first, second]);
    expect(getState().profileId).toBe("innovare");
    expect(getState().inbox).toEqual([{ id: "da-innovare" }]);
    expect(getState().switching).toBe(false);
  });

  it("silencioso não avisa", async () => {
    const done = switchProfile("aibiz", { silent: true });
    await vi.waitFor(() => expect(fake.loads).toHaveLength(1));
    fake.loads[0].resolve();
    await done;
    expect(getState().toasts).toEqual([]);
  });
});

describe("apagar o perfil atual", () => {
  it("volta para o padrão e registra na Atividade dele", async () => {
    setState({ profileId: "aibiz" });
    fake.managed = "aibiz";
    fake.list = [mk("default", { isDefault: true }), mk("innovare")];
    const done = deleteProfile(mk("aibiz"));
    await vi.waitFor(() => expect(fake.loads).toHaveLength(1));
    fake.loads[0].resolve();
    await done;
    expect(fake.calls).toContain("delete:aibiz");
    expect(fake.calls.some((c) => c.startsWith("/api/ops/activity?profile=default"))).toBe(true);
    expect(getState().profileId).toBe("default");
    expect(fake.managed).toBe("default");
  });
});

describe("lista de perfis", () => {
  it("se falhar na primeira vez vira erro; se já tinha lista, mantém", async () => {
    fake.failList = true;
    setState({ profiles: [], profilesStatus: "loading" });
    expect(await refreshProfiles()).toBeNull();
    expect(getState().profilesStatus).toBe("error");
    setState({ profiles: fake.list as Profile[] });
    await refreshProfiles();
    expect(getState().profilesStatus).toBe("ready");
  });
});
