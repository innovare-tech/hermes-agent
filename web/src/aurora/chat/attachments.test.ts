import { describe, expect, it } from "vitest";
import { attachError, attachKind, checkAttachment, fmtSize, MAX_ATTACH_BYTES, MAX_ATTACHMENTS, parseAttachRefs, withRefs } from "./attachments";

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

describe("parseAttachRefs", () => {
  it("o caminho cru do anexo vira chip (ícone + nome), o resto do texto fica", () => {
    const r = parseAttachRefs("@image:C:\\Users\\Usuario\\AppData\\Local\\hermes\\images\\upload_20261009_170843_2.png [screenshot]\n\nO que tem nesta imagem?");
    expect(r.attachments).toEqual([{ name: "upload_20261009_170843_2.png", kind: "image" }]);
    expect(r.text).toBe("O que tem nesta imagem?");
  });
  it("rótulo solto na linha de baixo some junto da referência; nome original quando conhecido", () => {
    const r = parseAttachRefs("@image:C:\\Users\\U\\hermes\\images\\upload_2026_2.png\n[screenshot]\n\nolha isso", { "upload_2026_2.png": "tela.png" });
    expect(r.text).toBe("olha isso");
    expect(r.attachments).toEqual([{ name: "tela.png", kind: "image" }]);
    expect(parseAttachRefs("@image:/a/b.png [screenshot]\n[screenshot]\nfim").text).toBe("fim");
    expect(parseAttachRefs("oi\n[screenshot]").text).toBe("oi\n[screenshot]");
  });
  it("@file e @pdf, várias referências e caminho com espaço", () => {
    const r = parseAttachRefs("@file:/home/u/relatório final.txt @pdf:/tmp/p/doc.pdf [pages]\n\nresuma");
    expect(r.attachments).toEqual([{ name: "relatório final.txt", kind: "file" }, { name: "doc.pdf", kind: "pdf" }]);
    expect(r.text).toBe("resuma");
  });
  it("no meio da frase o caminho vai até o espaço; sem caminho de verdade não mexe", () => {
    expect(parseAttachRefs("veja @image:/a/b.png [x] por favor")).toEqual({ text: "veja  por favor", attachments: [{ name: "b.png", kind: "image" }] });
    const same = "mande @image:isso para o time";
    expect(parseAttachRefs(same)).toEqual({ text: same, attachments: [] });
    expect(parseAttachRefs("texto comum")).toEqual({ text: "texto comum", attachments: [] });
  });
});
