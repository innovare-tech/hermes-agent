import { describe, expect, it } from "vitest";
import { parsePlaybook } from "./playbook";

describe("parsePlaybook", () => {
  it("quando X, faça Y → gatilho e ação", () => {
    const p = parsePlaybook("quando um cliente pedir nota fiscal no WhatsApp, gere a NF e envie o PDF", "inn", "b1")!;
    expect(p.trigger).toBe("Um cliente pedir nota fiscal no WhatsApp");
    expect(p.nodes.map((n) => n.kind)).toEqual(["trigger", "action", "cond", "action", "end"]);
    expect(p.nodes[3].text).toBe("Gere a NF e envie o PDF");
    expect(p.name).toBe("Um cliente pedir nota fiscal no …");
  });

  it("sem 'quando': a frase vira o gatilho; vazio não cria nada", () => {
    expect(parsePlaybook("Lead novo no site", "unic")!.nodes[3].text).toBe("Responder com base no histórico");
    expect(parsePlaybook("   ", "unic")).toBeNull();
  });
});
