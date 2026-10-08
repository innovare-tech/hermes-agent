import { describe, expect, it } from "vitest";
import type { GatewayField } from "../agent/types";
import { envChanges } from "./Gateways";

const f = (key: string, o: Partial<GatewayField> = {}): GatewayField => ({ key, label: key, help: "", url: null, secret: false, list: false, advanced: false, isSet: false, value: "", ...o });

describe("envChanges", () => {
  it("segredo vazio mantém o salvo; digitado é gravado", () => {
    const fields = [f("TOKEN", { secret: true, isSet: true })];
    expect(envChanges(fields, { TOKEN: "  " })).toEqual({});
    expect(envChanges(fields, { TOKEN: " abc " })).toEqual({ TOKEN: "abc" });
  });

  it("lista: uma por linha vira CSV e só grava se mudou", () => {
    const fields = [f("ALLOWED", { list: true, value: "1,2" })];
    expect(envChanges(fields, { ALLOWED: "1\n2" })).toEqual({});
    expect(envChanges(fields, { ALLOWED: "1\n2\n 3 " })).toEqual({ ALLOWED: "1,2,3" });
    expect(envChanges(fields, { ALLOWED: "" })).toEqual({ ALLOWED: "" });
  });
});
