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
        { name: "Whatsapp", status: "warn", value: "pairing" },
        { name: "Discord", status: "err", value: "erro" },
      ],
    });
    expect(healthFrom({ gateway_running: false, gateway_platforms: {} } as unknown as StatusResponse).items).toEqual([{ name: "Gateway de mensagens", status: "warn", value: "parado" }]);
  });
});
