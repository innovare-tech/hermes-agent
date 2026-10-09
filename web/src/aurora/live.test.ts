import { describe, expect, it } from "vitest";
import type { StatusResponse } from "@/lib/api";
import { healthFrom } from "./live";

describe("healthFrom", () => {
  it("traduz o /api/status para o cartão de Saúde", () => {
    const st = {
      gateway_running: true,
      gateway_platforms: {
        telegram: { state: "connected", updated_at: "" },
        whatsapp: { state: "pairing", updated_at: "" },
        discord: { state: "error", error_code: "auth", error_message: "token inválido", updated_at: "" },
      },
    } as unknown as StatusResponse;
    expect(healthFrom(st)).toMatchObject({
      online: true,
      items: [
        { name: "Gateway de mensagens", status: "ok", value: "ativo" },
        { name: "Telegram", status: "ok", value: "conectado" },
        { name: "WhatsApp", status: "warn", value: "pairing" },
        { name: "Discord", status: "err", value: "erro" },
      ],
    });
    expect(healthFrom({ gateway_running: false, gateway_platforms: {} } as unknown as StatusResponse).items).toEqual([{ name: "Gateway de mensagens", status: "warn", value: "parado" }]);
  });

  it("avisos graves da última hora viram problema; antigos não", async () => {
    const { severeFromLogs } = await import("./live");
    const now = new Date("2026-10-07T21:00:00").getTime();
    const lines = ["2026-10-07 20:30:00,1 WARNING web_server: event loop stalled 4051.7s (GIL pressure suspected)", "2026-10-07 18:00:00,1 ERROR gateway: telegram startup_failed"];
    expect(severeFromLogs(lines, now)).toEqual([{ text: "O painel ficou travado por 68 min na última hora", to: "/logs" }]);
  });

  it("atenção: gateway parado com canal ligado; ok sem canais", () => {
    const stopped = { gateway_running: false, gateway_platforms: {} } as unknown as StatusResponse;
    expect(healthFrom(stopped).level).toBe("ok");
    const h = healthFrom(stopped, [{ name: "Telegram", enabled: true, configured: true }]);
    expect(h.level).toBe("warn");
    expect(h.problems[0]).toMatchObject({ text: expect.stringMatching(/Gateway parado com 1 canal ligado/), to: "/gateways" });
  });
});

describe("cleanSnippet", async () => {
  const { cleanSnippet } = await import("./agent/live");
  it("tira marcadores, markdown e escapes de JSON", () => {
    // Trecho como vem da busca: barras dobradas e aspas escapadas do JSON.
    const raw = String.raw`>>>spike<<< em **negrito** \\hermes-agent\\web\", \"pattern`;
    expect(cleanSnippet(raw)).toBe(String.raw`spike em negrito \hermes-agent\web", "pattern`);
  });
});
