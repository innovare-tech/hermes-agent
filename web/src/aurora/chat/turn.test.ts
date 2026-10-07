import { describe, expect, it } from "vitest";
import { applyEvent, interrupted } from "./turn";
import type { AgentMessage, ToolStep } from "./types";

const empty: AgentMessage = { id: "a", role: "agent", steps: [], text: "", live: true };
const step: ToolStep = { id: "t1", kind: "terminal", name: "terminal", target: "ls", dur: "", status: "run", output: "" };

describe("applyEvent", () => {
  it("monta passos, texto e fecha o turno", () => {
    let m = applyEvent(empty, { type: "step", step });
    m = applyEvent(m, { type: "step", step: { ...step, status: "ok", dur: "0,3s", output: "a.txt" } });
    m = applyEvent(m, { type: "delta", text: "Feito" });
    m = applyEvent(m, { type: "delta", text: "." });
    m = applyEvent(m, { type: "done", meta: "m · 1k tokens" });
    expect(m.steps).toEqual([{ ...step, status: "ok", dur: "0,3s", output: "a.txt" }]);
    expect(m).toMatchObject({ text: "Feito.", live: false, meta: "m · 1k tokens" });
  });

  it("erro e interrupção fecham passos abertos", () => {
    const running = applyEvent(empty, { type: "step", step });
    expect(applyEvent(running, { type: "error", message: "falhou" })).toMatchObject({ live: false, text: "⚠ falhou", steps: [{ status: "ok" }] });
    expect(interrupted(running)).toMatchObject({ live: false, text: "— interrompido.", steps: [{ status: "ok" }] });
  });
});
