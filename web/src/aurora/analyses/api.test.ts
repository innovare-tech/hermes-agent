import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api-error";

const net = vi.hoisted(() => ({ fetchJSON: vi.fn() }));
vi.mock("@/lib/api", () => ({ fetchJSON: net.fetchJSON, authedFetch: vi.fn() }));

const { chatPrompt, clientsApi, clientsFrom, groupByUrgency, highlight, isUnseen, matches, periodLabel, tabPass, whenLabel } = await import("./api");
type A = import("./api").Analysis;

const T = new Date(2026, 9, 8, 12, 0).getTime() / 1000; // 08/10/2026 12:00
const mk = (o: Partial<A> = {}): A => ({
  id: 1, code: "A-1", status: "open", createdAt: T, channelId: "whatsapp:g", groupName: "Rota | Suporte", platform: "whatsapp",
  clientId: "ac2214", clientName: "Auto Center Rota", period: { from: T - 1560, to: T - 60 }, messageCount: 16, participants: [],
  category: "bug", urgency: "critica", confidence: 0.94, summary: "Sem confirmação desde as 8h.",
  evidence: { quotes: [{ author: "Sabrina", at: "09:02", text: "ninguém recebe" }], audios: [], media: [] },
  checks: [{ result: "problem", text: "37 recusadas" }], hypothesis: "Modelo reprovado.", suggestedReply: "Oi!", error: null,
  telegram: null, seenBy: [], resolved: null, irrelevant: null, ...o,
});

describe("filtros e abas", () => {
  it("aba Não vistas = aberta sem ninguém que viu; resolvida e falha seguem as regras", () => {
    expect(isUnseen(mk())).toBe(true);
    expect(isUnseen(mk({ seenBy: [{ name: "Você", at: T }] }))).toBe(false);
    expect(isUnseen(mk({ status: "resolved" }))).toBe(false);
    expect(tabPass.open(mk({ status: "failed" }))).toBe(true); // "aberta" inclui a que falhou
    expect(tabPass.resolved(mk({ status: "resolved" }))).toBe(true);
    expect(tabPass.irrelevant(mk({ status: "irrelevant" }))).toBe(true);
    expect(tabPass.all(mk({ status: "irrelevant" }))).toBe(true);
  });

  it("multi-seleção: vazio passa tudo; com valores exige um deles", () => {
    const a = mk();
    expect(matches(a, { clients: [], categories: [], urgencies: [] })).toBe(true);
    expect(matches(a, { clients: ["x", "ac2214"], categories: ["bug"], urgencies: ["critica", "alta"] })).toBe(true);
    expect(matches(a, { clients: ["x"], categories: [], urgencies: [] })).toBe(false);
    expect(matches(mk({ category: null }), { clients: [], categories: ["bug"], urgencies: [] })).toBe(false);
  });
});

describe("lista", () => {
  it("agrupa de Crítica a Baixa; a que falhou (sem urgência) vem primeiro", () => {
    const g = groupByUrgency([mk({ id: 1, urgency: "baixa" }), mk({ id: 2, urgency: null, category: null, status: "failed" }), mk({ id: 3, urgency: "critica" })]);
    expect(g.map((x) => x.key)).toEqual(["failed", "critica", "baixa"]);
    expect(g[0].items[0].id).toBe(2);
  });

  it("clientes com análises, ordenados pelas abertas", () => {
    const c = clientsFrom([mk({ id: 1, clientId: "b", clientName: "B" }), mk({ id: 2, clientId: "a", clientName: "A" }), mk({ id: 3, clientId: "a", clientName: "A" }), mk({ id: 4, clientId: "c", clientName: "C", status: "resolved" }), mk({ id: 5, clientId: null })]);
    expect(c.map((x) => [x.systemClientId, x.openAnalyses])).toEqual([["a", 2], ["b", 1], ["c", 0]]);
  });
});

describe("textos", () => {
  it("busca ignora acento e devolve o trecho certo", () => {
    expect(highlight("Clínica Bem Viver", "clinica")).toEqual(["", "Clínica", " Bem Viver"]);
    expect(highlight("Pet Feliz", "zzz")).toEqual(["Pet Feliz", "", ""]);
  });

  it("período e hora da lista: hoje, ontem e data", () => {
    const now = new Date(2026, 9, 8, 14, 0);
    expect(periodLabel(mk({ period: { from: T - 1560, to: T - 60 } }), now)).toBe("Hoje, 11:34–11:59");
    expect(whenLabel(mk({ period: { from: T - 60, to: T - 60 } }), now)).toBe("11:59");
    expect(whenLabel(mk({ period: { from: T - 86400, to: T - 86400 } }), now)).toBe("Ontem");
    expect(whenLabel(mk({ period: { from: T - 5 * 86400, to: T - 5 * 86400 } }), now)).toBe("03/10");
  });

  it("monta o contexto da conversa com a análise e a pergunta", () => {
    const p = chatPrompt(mk({ evidence: { quotes: [{ author: "Sabrina", at: "09:02", text: "ninguém recebe" }], audios: [{ url: "/u", author: "Cláudio", transcript: "estou no prejuízo" }], media: [] } }), "Por que essa urgência?");
    expect(p).toContain("A-1");
    expect(p).toContain("Auto Center Rota");
    expect(p).toContain("[09:02] Sabrina: ninguém recebe");
    expect(p).toContain("Cláudio: estou no prejuízo");
    expect(p).toContain("Hipótese: Modelo reprovado.");
    expect(p.endsWith("Pergunta: Por que essa urgência?")).toBe(true);
  });
});

describe("diretório de clientes (rota de outra frente)", () => {
  beforeEach(() => {
    net.fetchJSON.mockReset();
  });
  const gone = () => new ApiError("não encontrado", { status: 404, body: "", url: "/api/clients" });

  it("404 vira diretório vazio, sem erro", async () => {
    net.fetchJSON.mockRejectedValue(gone());
    expect(await clientsApi.page("", null)).toMatchObject({ available: false, items: [], total: 0 });
    expect(await clientsApi.withAnalyses()).toBeNull();
  });

  it("outros erros continuam subindo", async () => {
    net.fetchJSON.mockRejectedValue(new ApiError("boom", { status: 500, body: "", url: "/api/clients" }));
    await expect(clientsApi.page("a", null)).rejects.toThrow("boom");
  });

  it("pede 30 por vez com cursor e aceita lista ou {items}", async () => {
    net.fetchJSON.mockResolvedValueOnce({ items: [{ systemClientId: "a", name: "A" }], total: 1284, nextCursor: "c2" });
    const p = await clientsApi.page("pad", "c1");
    expect(net.fetchJSON.mock.calls[0][0]).toBe("/api/clients?q=pad&limit=30&cursor=c1");
    expect(p).toMatchObject({ available: true, total: 1284, nextCursor: "c2" });
    net.fetchJSON.mockResolvedValueOnce([{ systemClientId: "a", name: "A" }]);
    expect(await clientsApi.withAnalyses()).toHaveLength(1);
    net.fetchJSON.mockResolvedValueOnce({ items: [{ systemClientId: "b", name: "B" }] });
    expect(await clientsApi.withAnalyses()).toHaveLength(1);
  });
});
