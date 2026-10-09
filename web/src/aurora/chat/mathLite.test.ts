import { describe, expect, it } from "vitest";
import { texToParts, texToText } from "./mathLite";

describe("frações", () => {
  it("em linha: a/b, com parênteses quando precisa", () => {
    expect(texToText("\\frac{a}{b}")).toBe("a/b");
    expect(texToText("\\frac{a+1}{2b}")).toBe("(a+1)/(2b)");
  });
  it("em bloco: Bhaskara vira numerador sobre denominador", () => {
    expect(texToParts("x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}")).toEqual(["x =", { n: "-b ± √(b² - 4ac)", d: "2a" }]);
  });
  it("várias frações, texto no meio e fração aninhada ou dentro de potência ficam em linha", () => {
    expect(texToParts("\\frac{1}{2} + \\frac{3}{4}")).toEqual([{ n: "1", d: "2" }, "+", { n: "3", d: "4" }]);
    expect(texToParts("\\frac{1}{\\frac{a}{b}}")).toEqual([{ n: "1", d: "a/b" }]);
    expect(texToParts("e^{\\frac{1}{2}}")).toEqual(["e^(1/2)"]);
    expect(texToParts("x + 1")).toEqual(["x + 1"]);
  });
});
