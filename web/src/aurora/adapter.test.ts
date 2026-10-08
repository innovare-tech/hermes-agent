import { describe, expect, it } from "vitest";
import { matchesPerson } from "./adapter";

describe("matchesPerson", () => {
  const msg = (channelId: string, from = "") => ({ channelId, from });

  it("telefone casa pelos últimos 8 dígitos, com ou sem formatação", () => {
    expect(matchesPerson(msg("whatsapp:5511999990000@s.whatsapp.net"), { phone: "+55 (11) 99999-0000" })).toBe(true);
    expect(matchesPerson(msg("whatsapp:5511888880000"), { phone: "+55 11 99999-0000" })).toBe(false);
  });

  it("telegram por @usuario no remetente; e-mail no canal", () => {
    expect(matchesPerson(msg("telegram:123", "ana_silva"), { telegram: "@Ana_Silva" })).toBe(true);
    expect(matchesPerson(msg("email:ana@empresa.com"), { email: "Ana@Empresa.com" })).toBe(true);
  });

  it("sem identificador, nada casa", () => {
    expect(matchesPerson(msg("telegram:123", "Ana"), {})).toBe(false);
  });
});
