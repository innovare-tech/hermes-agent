import { describe, expect, it } from "vitest";
import type { ApiKey } from "../agent/types";
import { isRelevantKey, keyName, savedHint } from "./ApiKeysEditor";

const k = (key: string, o: Partial<ApiKey> = {}): ApiKey => ({ key, description: "", url: null, category: "provider", isSet: false, preview: "", advanced: false, ...o });

describe("chaves de API para humanos", () => {
  it("nome amigável, com fallback legível", () => {
    expect(keyName("ANTHROPIC_API_KEY")).toBe("Anthropic (Claude)");
    expect(keyName("STEPFUN_API_KEY")).toBe("Stepfun");
  });
  it("só credenciais são relevantes", () => {
    expect(isRelevantKey(k("OPENROUTER_API_KEY"))).toBe(true);
    expect(isRelevantKey(k("OPENROUTER_BASE_URL"))).toBe(false);
    expect(isRelevantKey(k("HERMES_ANON_API_SECRET"))).toBe(false);
    expect(isRelevantKey(k("ANTHROPIC_API_KEY", { advanced: true }))).toBe(true); // conhecida: sempre à vista
    expect(isRelevantKey(k("STEPFUN_API_KEY", { advanced: true }))).toBe(false);
  });
  it("valor salvo vira 'termina em'", () => {
    expect(savedHint("«redacted:nvap...dSsA»")).toBe("salva · termina em dSsA");
    expect(savedHint("")).toBe("salva");
  });
});
