import { describe, expect, it } from "vitest";
import { keyDescription } from "./ApiKeysEditor";

describe("keyDescription", () => {
  it("chaves do Hermes têm descrição própria; as do catálogo, uma genérica em pt-BR", () => {
    expect(keyDescription("HEALTH_SSH_KEY")).toMatch(/SSH/);
    expect(keyDescription("UPSTAGE_API_KEY")).toBe("Chave de acesso de Upstage");
    expect(keyDescription("UPSTAGE_BASE_URL")).toBe("Endereço (URL) de Upstage");
    expect(keyDescription("GEMINI_API_KEY")).toBe("Chave do Google AI Studio (Gemini)");
    expect(keyDescription("GOOGLE_API_KEY")).toBe("Chave do Google AI Studio (Gemini)");
    expect(keyDescription("NVIDIA_API_KEY")).toBe("Chave da NVIDIA NIM");
    expect(keyDescription("XIAOMI_API_KEY")).toBe("Chave de acesso de Xiaomi");
  });
});
