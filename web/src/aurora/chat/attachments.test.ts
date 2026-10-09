import { describe, expect, it } from "vitest";
import { attachError, attachKind, checkAttachment, fmtSize, MAX_ATTACH_BYTES, MAX_ATTACHMENTS, withRefs } from "./attachments";

const f = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("anexos", () => {
  it("tipo: imagem, PDF ou arquivo", () => {
    expect(attachKind(f("a.png", "image/png"))).toBe("image");
    expect(attachKind(f("foto.JPG", ""))).toBe("image");
    expect(attachKind(f("relatorio.pdf", "application/pdf"))).toBe("pdf");
    expect(attachKind(f("dados.csv", "text/csv"))).toBe("file");
  });
  it("recusa vazio, grande demais, formato de imagem sem suporte e excesso de anexos", () => {
    expect(checkAttachment(f("a.png", "image/png"), 0)).toBeNull();
    expect(checkAttachment(f("a.png", "image/png", 0), 0)).toMatch(/vazio/);
    expect(checkAttachment(f("grande.pdf", "application/pdf", MAX_ATTACH_BYTES + 1), 0)).toMatch(/25,0 MB/);
    expect(checkAttachment(f("a.svg", "image/svg+xml"), 0)).toMatch(/sem suporte/);
    expect(checkAttachment(f("b.png", "image/png"), MAX_ATTACHMENTS)).toMatch(/No máximo/);
  });
  it("tamanho legível", () => {
    expect([fmtSize(800), fmtSize(2048), fmtSize(5.5 * 1024 * 1024)]).toEqual(["800 B", "2 KB", "5,5 MB"]);
  });
  it("referências de arquivo entram na frente do pedido", () => {
    expect(withRefs("resuma", ["@file:a.csv", "@file:b.txt"])).toBe("@file:a.csv @file:b.txt\n\nresuma");
    expect(withRefs("oi")).toBe("oi");
  });
  it("erros do gateway em português", () => {
    expect(attachError("pdftoppm not installed (poppler-utils package required)")).toMatch(/leitor de PDF/);
    expect(attachError("image too large (30000000 bytes; cap is 25 MB)")).toMatch(/grande demais/);
    expect(attachError("")).toBe("Não consegui anexar.");
  });
});
