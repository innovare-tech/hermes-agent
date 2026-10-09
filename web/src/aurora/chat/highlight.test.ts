import { describe, expect, it } from "vitest";
import { highlight } from "./highlight";

const kinds = (code: string, lang: string) => highlight(code, lang).filter((t) => t.t).map((t) => `${t.t}:${t.v}`);

describe("highlight", () => {
  it("python: palavra-chave, texto, número e comentário", () => {
    expect(kinds('def f(x):  # soma\n    return "a" + 1', "python")).toEqual(["k:def", "c:# soma", "k:return", 's:"a"', "n:1"]);
  });
  it("typescript e json", () => {
    expect(kinds("const a = 'x' // c", "ts")).toEqual(["k:const", "s:'x'", "c:// c"]);
    expect(kinds('{"a": [1, true]}', "json")).toEqual(['s:"a"', "n:1", "l:true"]);
  });
  it("sem linguagem conhecida o texto não muda", () => {
    expect(highlight("qualquer coisa", "")).toEqual([{ t: "", v: "qualquer coisa" }]);
    expect(highlight("x", "klingon")).toEqual([{ t: "", v: "x" }]);
  });
  it("nunca perde nem inventa caracteres", () => {
    const src = 'if (a < b) { print("oi") } // fim\n`x ${y}`';
    expect(highlight(src, "js").map((t) => t.v).join("")).toBe(src);
    expect(highlight("SELECT * FROM t -- c", "sql").map((t) => t.v).join("")).toBe("SELECT * FROM t -- c");
  });
});
