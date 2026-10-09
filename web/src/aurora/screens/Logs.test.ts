import { describe, expect, it } from "vitest";
import { isConnectionNoise } from "./Logs";

describe("isConnectionNoise", () => {
  it("esconde abrir/fechar conexão do painel, não o resto", () => {
    expect(isConnectionNoise("tui_gateway.ws: ws accepted peer=127.0.0.1:64946")).toBe(true);
    expect(isConnectionNoise("ws closed peer=127.0.0.1 reaped_sessions=0")).toBe(true);
    expect(isConnectionNoise("tool terminal completed (0.19s)")).toBe(false);
    expect(isConnectionNoise("news closed early")).toBe(false);
  });
});

describe("displayLevel", () => {
  it("conectar ao Telegram é informação, não aviso; avisos de verdade ficam", async () => {
    const { displayLevel } = await import("./Logs");
    expect(displayLevel({ level: "WARN", msg: "[Telegram] Connected to Telegram (polling mode)" }).level).toBe("INFO");
    expect(displayLevel({ level: "WARN", msg: "[Telegram] Connecting to Telegram (attempt 1/8)…" }).level).toBe("INFO");
    expect(displayLevel({ level: "WARN", msg: "latência alta (840ms)" }).level).toBe("WARN");
  });
});
