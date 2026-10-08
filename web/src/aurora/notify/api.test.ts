import { beforeEach, describe, expect, it, vi } from "vitest";

const net = vi.hoisted(() => ({ fetchJSON: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchJSON: net.fetchJSON }));

const { changesLabel, countChanges, daysHint, matchPeople, mentionLine, missingDefaults, notifyApi, quietLabel, shiftTime, testLabel, topicInfo, topicOptions } = await import("./api");
type R = import("./api").Routes;

const routes = (): R => ({
  chatId: "-100",
  analyses: { critical: { topic: 11, quiet: false }, high: { topic: 12, quiet: false }, medium: { topic: 12, quiet: true }, low: { topic: "off", quiet: true }, mentions: [1] },
  infra: { critical: { topic: 10, quiet: false }, warning: { topic: 10, quiet: true }, info: { topic: null, quiet: true }, mentions: [] },
  digest: { topic: null, time: "08:30", days: [1, 2, 3, 4, 5] },
  quietHours: { from: "20:00", to: "08:00", weekend: true, tz: "America/Sao_Paulo" },
});
const topics = [
  { threadId: 10, name: "Alertas de infra", color: "#fb6f5f", icon: "server" },
  { threadId: 11, name: "Grupos de clientes", color: "#6fb9f0", icon: "users-round" },
];
const people = [
  { id: 1, name: "Luana Reis", username: "luareis", role: "Dono" },
  { id: 2, name: "Bruna Teles", username: null, role: "Infra" },
  { id: 3, name: "João Pires", username: "joaopires", role: "Admin" },
];

beforeEach(() => net.fetchJSON.mockReset());

describe("contrato", () => {
  it("chama as rotas de /api/notify com o corpo do contrato", async () => {
    net.fetchJSON.mockResolvedValue({});
    await notifyApi.telegram();
    await notifyApi.saveRoutes(routes());
    await notifyApi.test("infra", routes());
    await notifyApi.refreshTopics(true);
    await notifyApi.setChat("-100");
    const calls = net.fetchJSON.mock.calls.map(([u, i]) => [u, i?.method ?? "GET", i?.body ? JSON.parse(i.body) : undefined]);
    expect(calls[0]).toEqual(["/api/notify/telegram", "GET", undefined]);
    expect(calls[1][0]).toBe("/api/notify/routes");
    expect(calls[1][1]).toBe("PUT");
    expect(calls[2]).toEqual(["/api/notify/test", "POST", { type: "infra", draft: routes() }]);
    expect(calls[3]).toEqual(["/api/notify/telegram/topics/refresh", "POST", { create: true }]);
    expect(calls[4]).toEqual(["/api/notify/telegram", "PUT", { chatId: "-100" }]);
  });
});

describe("tópicos", () => {
  it("opções: tópicos do grupo, Geral e Não enviar; grupo sem tópicos só oferece Geral e Não enviar", () => {
    expect(topicOptions(topics, true).map((o) => o.value)).toEqual([10, 11, null, "off"]);
    expect(topicOptions(topics, false).map((o) => o.value)).toEqual([null, "off"]);
    expect(topicOptions(topics, true)[0].sub).toBe("Servidores, filas, gateways");
  });

  it("destino salvo: conhecido, Geral, Não enviar e tópico que o painel não conhece", () => {
    expect(topicInfo(11, topics).name).toBe("Grupos de clientes");
    expect(topicInfo(null, topics).name).toBe("Geral (sem tópico)");
    expect(topicInfo("off", topics).name).toBe("Não enviar");
    expect(topicInfo(99, topics).name).toBe("Tópico 99");
  });

  it("tópicos padrão que faltam", () => {
    expect(missingDefaults(topics)).toEqual(["Conversa"]);
    expect(missingDefaults([])).toHaveLength(3);
  });
});

describe("textos e horários", () => {
  it("passo de 30 min volta à meia-noite", () => {
    expect(shiftTime("08:30", 30)).toBe("09:00");
    expect(shiftTime("23:30", 30)).toBe("00:00");
    expect(shiftTime("00:00", -30)).toBe("23:30");
  });

  it("dias do resumo", () => {
    expect(daysHint([1, 2, 3, 4, 5])).toBe("Segunda a sexta");
    expect(daysHint([])).toBe("Nenhum dia marcado: o resumo não será enviado.");
    expect(daysHint([0, 6])).toBe("2 dias por semana");
    expect(daysHint([3])).toBe("1 dia por semana");
  });

  it("silêncio: crítico sempre na hora; não enviar não segura nada", () => {
    const q = routes().quietHours;
    expect(quietLabel({ topic: 1, quiet: false }, true, q)).toBe("Sempre na hora");
    expect(quietLabel({ topic: "off", quiet: true }, false, q)).toBe("—");
    expect(quietLabel({ topic: 1, quiet: true }, false, q)).toBe("Segura das 20:00 às 08:00");
    expect(quietLabel({ topic: 1, quiet: false }, false, q)).toBe("Na hora, sem pausa");
  });

  it("resultado do teste", () => {
    expect(testLabel({ ok: true, topic: 11, topicName: "Grupos de clientes", latencyMs: 640, messageUrl: null })).toBe("Chegou em “Grupos de clientes” em 0,6 s");
    expect(testLabel({ ok: false, code: "topic_off", message: "Este aviso está como “Não enviar”." })).toBe("Este aviso está como “Não enviar”.");
  });
});

describe("alterações não salvas", () => {
  it("conta níveis, menções, resumo e silêncio", () => {
    const a = routes();
    expect(countChanges(a, routes())).toBe(0);
    const b = routes();
    b.analyses.high.topic = 11;
    b.analyses.mentions = [1, 2];
    expect(countChanges(b, a)).toBe(2);
    b.digest.time = "09:00";
    b.quietHours.weekend = false;
    expect(countChanges(b, a)).toBe(4);
    expect(changesLabel(1)).toBe("1 alteração não salva");
    expect(changesLabel(3)).toBe("3 alterações não salvas");
  });
});

describe("pessoas", () => {
  it("busca por nome ou @usuário sem acento e esconde quem já foi marcado", () => {
    expect(matchPeople(people, [], "").map((p) => p.id)).toEqual([1, 2, 3]);
    expect(matchPeople(people, [1], "").map((p) => p.id)).toEqual([2, 3]);
    expect(matchPeople(people, [], "joao").map((p) => p.id)).toEqual([3]);
    expect(matchPeople(people, [], "@luareis").map((p) => p.id)).toEqual([1]);
    expect(matchPeople(people, [], "zzz")).toEqual([]);
  });

  it("linha de menções: @usuário, ou o nome quando não há @", () => {
    expect(mentionLine([1, 2, 77], people)).toBe("@luareis Bruna Teles equipe");
  });
});
