import { describe, expect, it } from "vitest";
import { answered, applyEvent, interrupted, keepForRetry, keepForUndo, lastUserIndex, planEdit, visibleCount } from "./turn";
import type { AgentMessage, ChatMessage, ToolStep } from "./types";

const empty: AgentMessage = { id: "a", role: "agent", steps: [], text: "", live: true };
const step: ToolStep = { id: "t1", kind: "terminal", name: "terminal", target: "ls", dur: "", status: "run", output: "" };

describe("applyEvent", () => {
  it("monta passos, texto e fecha o turno com o rodapé", () => {
    let m = applyEvent(empty, { type: "step", step }, 1000);
    m = applyEvent(m, { type: "step", step: { ...step, status: "ok", dur: "0,3s", output: "a.txt" } }, 1300);
    m = applyEvent(m, { type: "delta", text: "Feito" });
    m = applyEvent(m, { type: "delta", text: "." });
    m = applyEvent(m, { type: "done", stat: { model: "m", secs: 2, tokens: 1200 } });
    expect(m.steps).toEqual([{ ...step, status: "ok", dur: "0,3s", output: "a.txt", startedAt: 1000 }]);
    expect(m).toMatchObject({ text: "Feito.", live: false, stat: { model: "m", secs: 2, tokens: 1200 } });
  });

  it("erro vira cartão em português (sem texto de erro como resposta) e fecha passos abertos", () => {
    const running = applyEvent(empty, { type: "step", step });
    const m = applyEvent(running, { type: "error", message: "⚠ Gemini HTTP 404 (NOT_FOUND): models/gemini-9 is not found" });
    expect(m).toMatchObject({ live: false, text: "", steps: [{ status: "ok" }], error: { kind: "model", title: "O modelo gemini-9 não existe neste provedor" } });
  });

  it("interrupção fica no histórico como 'interrompido', sem texto inventado", () => {
    const running = applyEvent(empty, { type: "step", step });
    expect(interrupted(running)).toMatchObject({ live: false, interrupted: true, text: "", steps: [{ status: "ok" }] });
    expect(applyEvent(running, { type: "interrupted" })).toMatchObject({ interrupted: true });
  });

  it("aprovação: pendente, primeiro desfecho vence, cancela", () => {
    const approval = { id: "r1", command: "rm -rf build", description: "apagar build", choices: ["once" as const, "deny" as const], respond: () => {} };
    let m = applyEvent(empty, { type: "approval", approval });
    expect(m.approval?.status).toBe("pending");
    m = answered(m, "deny");
    m = answered(m, "once");
    expect(m.approval?.status).toBe("denied");
    const pending = applyEvent(empty, { type: "approval", approval: { ...approval, choices: ["once"] } });
    expect(applyEvent(pending, { type: "approval.cancel", id: "r1" }).approval?.status).toBe("cancelled");
  });
});

describe("pensamento (reasoning)", () => {
  it("acumula os trechos, conta o tempo e fecha quando a resposta começa", () => {
    let m = applyEvent(empty, { type: "reasoning", text: "Vou " }, 1000);
    m = applyEvent(m, { type: "reasoning", text: "calcular." }, 1500);
    expect(m).toMatchObject({ reasoning: "Vou calcular.", thinkStart: 1000 });
    expect(m.thinkMs).toBeUndefined();
    m = applyEvent(m, { type: "delta", text: "391" }, 4000);
    expect(m.thinkMs).toBe(3000);
    // o tempo não muda com os trechos de texto seguintes
    expect(applyEvent(m, { type: "delta", text: "!" }, 9000).thinkMs).toBe(3000);
  });

  it("bloco completo (provedor sem streaming) substitui; sem texto o turno ainda fecha o tempo", () => {
    let m = applyEvent(empty, { type: "reasoning", text: "parcial" }, 100);
    m = applyEvent(m, { type: "reasoning", text: "texto inteiro", full: true }, 110);
    expect(m.reasoning).toBe("texto inteiro");
    expect(applyEvent(m, { type: "done" }, 2600).thinkMs).toBe(2500);
  });

  it("sem raciocínio não inventa bloco nem tempo", () => {
    const m = applyEvent(applyEvent(empty, { type: "delta", text: "oi" }), { type: "done" });
    expect(m.reasoning).toBeUndefined();
    expect(m.thinkMs).toBeUndefined();
  });
});

const u = (id: string, rowId?: number): ChatMessage => ({ id, role: "user", text: id, rowId });
const a = (id: string, text = "r"): ChatMessage => ({ id, role: "agent", steps: [], text, live: false });

describe("contagem e cortes (refazer, desfazer, editar)", () => {
  it("'N mensagens' conta só perguntas e respostas visíveis", () => {
    const sys: ChatMessage = { id: "s", role: "system", cmd: "/status" };
    const onlyTools: ChatMessage = { id: "t", role: "agent", steps: [{ ...step, status: "ok" }], text: "", live: false };
    expect(visibleCount([u("1"), a("2"), sys, u("3"), onlyTools])).toBe(3);
    expect(visibleCount([])).toBe(0);
  });

  it("refazer: mantém até a última pergunta (a resposta é substituída, não ganha balão novo)", () => {
    const list = [u("1"), a("2"), u("3"), a("4")];
    expect(keepForRetry(list)?.map((m) => m.id)).toEqual(["1", "2", "3"]);
    expect(keepForRetry([])).toBeNull();
  });

  it("desfazer: some a última pergunta e a resposta", () => {
    expect(keepForUndo([u("1"), a("2"), u("3"), a("4")])?.map((m) => m.id)).toEqual(["1", "2"]);
    expect(keepForUndo([a("x")])).toBeNull();
    expect(lastUserIndex([u("1"), a("2")])).toBe(0);
  });

  it("editar: com endereço no histórico corta ali; sem endereço só a última pode", () => {
    const list = [u("1", 10), a("2"), u("3"), a("4"), u("5"), a("6")];
    expect(planEdit(list, "1")).toMatchObject({ mode: "truncate", rowId: 10, keep: [] });
    expect(planEdit(list, "5")).toMatchObject({ mode: "undo-last" });
    expect(planEdit(list, "5")?.keep.map((m) => m.id)).toEqual(["1", "2", "3", "4"]);
    expect(planEdit(list, "3")).toBeNull();
    expect(planEdit(list, "2")).toBeNull();
  });
});

describe("interrupção com tokens", () => {
  it("o evento traz o rodapé do turno parado", () => {
    const m = applyEvent(applyEvent(empty, { type: "delta", text: "parcial" }), { type: "interrupted", stat: { model: "m", secs: 2, tokens: 800 } });
    expect(m).toMatchObject({ interrupted: true, live: false, text: "parcial", stat: { tokens: 800 } });
  });
});
