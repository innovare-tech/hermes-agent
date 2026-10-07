import { describe, expect, it } from "vitest";
import { actOnBehalf, getState, setState } from "./store";

const send = { business: "inn", kind: "msg" as const, action: "Respondeu Marcos", why: "teste", done: "Enviado", target: { kind: "reply" as const, id: "i1", text: "oi" } };

describe("actOnBehalf", () => {
  it("bloqueia quando pausado: sem Atividade, toast de bloqueio", async () => {
    setState({ paused: true, activity: [] });
    expect(await actOnBehalf(send)).toBe(false);
    expect(getState().activity).toHaveLength(0);
    expect(getState().toast?.text).toMatch(/pausado/);
  });

  it("executa quando ativo: registra na Atividade e avisa", async () => {
    setState({ paused: false, activity: [] });
    expect(await actOnBehalf(send)).toBe(true);
    expect(getState().activity[0]).toMatchObject({ action: "Respondeu Marcos", business: "inn", reversible: true, undone: false });
    expect(getState().toast?.text).toBe("Enviado");
  });
});
