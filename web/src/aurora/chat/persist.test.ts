import { afterEach, describe, expect, it, vi } from "vitest";
import { applyExtras, extrasOf, limitExtras, loadExtras, saveExtras } from "./persist";
import type { AgentMessage, ChatMessage, CommandCard } from "./types";

const card: CommandCard = { kind: "card", icon: "gauge", title: "Estado da conversa", lines: ["Modelo: m"] };
const user = (rowId: number): ChatMessage => ({ id: "u" + rowId, role: "user", text: "p" + rowId, rowId });
const agent = (o: Partial<AgentMessage> = {}): AgentMessage => ({ id: "a", role: "agent", steps: [], text: "resposta", live: false, ...o });
const sys = (id: string, cmd = "/status"): ChatMessage => ({ id, role: "system", cmd, card });

/** O que o backend devolve no histórico: sem cartões, sem pensamento, sem tokens, com o aviso em inglês. */
const history = (): ChatMessage[] => [user(1), agent({ id: "h1", stat: { model: "m", secs: 2 } }), user(2), agent({ id: "h2", text: "", error: { kind: "other", title: "t", body: "b", detail: "Your request was not processed. Send it again if you still want me to carry it out.", retryable: true, switchModel: false } })];

describe("extras guardados por sessão", () => {
  it("cartões de comando, pensamento e tokens voltam ao recarregar, no lugar certo", () => {
    const live: ChatMessage[] = [sys("s0", "/usage"), user(1), agent({ reasoning: "pensei", thinkMs: 3000, stat: { model: "m", secs: 2, tokens: 1500 } }), sys("s1"), user(2), agent({ text: "", interrupted: true })];
    const ex = extrasOf(live);
    expect(ex.cards.map((c) => [c.after, c.cmd])).toEqual([[-1, "/usage"], [1, "/status"]]);
    const back = applyExtras(history(), JSON.parse(JSON.stringify(ex)));
    expect(back.map((m) => (m.role === "system" ? m.cmd : m.role === "user" ? "U" + m.rowId : "A"))).toEqual(["/usage", "U1", "A", "/status", "U2", "A"]);
    const a1 = back[2] as AgentMessage;
    expect(a1).toMatchObject({ reasoning: "pensei", thinkMs: 3000, stat: { model: "m", secs: 2, tokens: 1500 } });
    // o turno interrompido volta como "interrompido", não como o aviso em inglês
    expect(back[5]).toMatchObject({ interrupted: true, error: undefined });
  });

  it("turno que falhou por erro do modelo volta com o cartão de erro de antes", () => {
    const err = { kind: "model" as const, title: "O modelo x não existe neste provedor", body: "Escolha outro modelo para continuar.", detail: "404", retryable: false, switchModel: true };
    const ex = extrasOf([user(1), agent({ text: "", error: err }), user(2), agent({ text: "", error: err })]);
    const back = applyExtras(history(), ex) as AgentMessage[];
    expect(back[3].error).toMatchObject({ kind: "model", title: err.title });
  });

  it("o pensamento do backend tem prioridade", () => {
    const ex = extrasOf([user(1), agent({ reasoning: "guardado", thinkMs: 2000 })]);
    const h = history();
    (h[1] as AgentMessage).reasoning = "do backend";
    expect((applyExtras(h, ex)[1] as AgentMessage).reasoning).toBe("do backend");
  });

  it("sem extras ou pergunta sem endereço: não inventa nada", () => {
    const h = history();
    expect(applyExtras(h, null)).toBe(h);
    expect(extrasOf([{ id: "u", role: "user", text: "x" }, sys("s")]).cards).toEqual([]);
  });

  it("limite: últimas 50 entradas e 200 KB, descartando as mais antigas", () => {
    const cards = Array.from({ length: 80 }, (_, i) => ({ n: i, after: -1, cmd: "/c" + i, card }));
    const lim = limitExtras({ cards, turns: {} });
    expect(lim.cards).toHaveLength(50);
    expect(lim.cards[0].cmd).toBe("/c30");
    const big = Array.from({ length: 10 }, (_, i) => ({ n: i, after: -1, cmd: "/c" + i, card: { ...card, raw: "x".repeat(30_000) } }));
    const small = limitExtras({ cards: big, turns: {} });
    expect(JSON.stringify(small).length).toBeLessThanOrEqual(200_000);
    expect(small.cards.at(-1)?.cmd).toBe("/c9");
  });
});

describe("localStorage", () => {
  const mem = () => {
    const d = new Map<string, string>();
    return { getItem: (k: string) => d.get(k) ?? null, setItem: (k: string, v: string) => void d.set(k, v), removeItem: (k: string) => void d.delete(k), d };
  };
  afterEach(() => vi.unstubAllGlobals());

  it("grava e lê por id da sessão", () => {
    const s = mem();
    vi.stubGlobal("localStorage", s);
    saveExtras("sess1", [user(1), agent({ reasoning: "r" }), sys("s")]);
    expect(s.d.has("hermes.aurora.chat.sess1")).toBe(true);
    expect(loadExtras("sess1")?.turns["1"]?.r).toBe("r");
    expect(loadExtras("outra")).toBeNull();
  });

  it("só guarda as últimas 40 sessões", () => {
    const s = mem();
    vi.stubGlobal("localStorage", s);
    for (let i = 0; i < 45; i++) saveExtras("s" + i, [user(1), agent({ reasoning: "r" })]);
    expect(loadExtras("s0")).toBeNull();
    expect(loadExtras("s44")).not.toBeNull();
  });

  it("sem storage, storage que lança ou JSON quebrado: segue sem erro", () => {
    vi.stubGlobal("localStorage", undefined);
    expect(() => saveExtras("x", [user(1), agent({ reasoning: "r" })])).not.toThrow();
    expect(loadExtras("x")).toBeNull();
    vi.stubGlobal("localStorage", { getItem: () => "{quebrado", setItem: () => { throw new Error("cota"); }, removeItem: () => {} });
    expect(loadExtras("x")).toBeNull();
    expect(() => saveExtras("x", [user(1), agent({ reasoning: "r" })])).not.toThrow();
  });
});
