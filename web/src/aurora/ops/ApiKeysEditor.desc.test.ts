import { describe, expect, it } from "vitest";
import { keyDescription } from "./ApiKeysEditor";

describe("keyDescription", () => {
  it("chaves do Hermes têm descrição própria; as do catálogo, uma genérica em pt-BR", () => {
    expect(keyDescription("HEALTH_SSH_KEY")).toMatch(/SSH/);
    expect(keyDescription("UPSTAGE_API_KEY")).toBe("Chave de acesso de Upstage");
    expect(keyDescription("UPSTAGE_BASE_URL")).toBe("Endereço (URL) de Upstage");
    expect(keyDescription("XIAOMI_API_KEY")).toBe("Chave de acesso de Xiaomi");
  });
});
