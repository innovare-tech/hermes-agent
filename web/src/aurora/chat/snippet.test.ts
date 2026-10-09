import { describe, expect, it } from "vitest";
import { hitParts } from "./snippet";

describe("hitParts", () => {
  it("destaca o termo sem diferenciar maiúsculas nem acentos", () => {
    expect(hitParts("Configuração do Hermes", "configuracao")).toEqual([
      { t: "Configuração", hit: true },
      { t: " do Hermes", hit: false },
    ]);
  });
  it("várias palavras; sem termo devolve o texto inteiro", () => {
    expect(hitParts("um dois três", "dois um").map((p) => p.hit)).toEqual([true, false, true, false]);
    expect(hitParts("texto", "")).toEqual([{ t: "texto", hit: false }]);
    expect(hitParts("texto", "x")).toEqual([{ t: "texto", hit: false }]);
  });
});
