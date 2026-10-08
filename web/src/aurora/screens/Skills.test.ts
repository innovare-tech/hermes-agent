import { describe, expect, it } from "vitest";
import { cleanDescription } from "./Skills";

describe("cleanDescription", () => {
  it("tira trecho em chinês entre parênteses e mantém o resto", () => {
    expect(cleanDescription("Infographics: 21 layouts x 21 styles (信息图 21 种) for posts")).toBe("Infographics: 21 layouts x 21 styles for posts");
    expect(cleanDescription("Plain (no cjk) text")).toBe("Plain (no cjk) text");
  });
});
