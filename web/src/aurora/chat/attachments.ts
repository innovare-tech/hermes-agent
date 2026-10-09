// Anexos da Conversa: tipo, limites e leitura do arquivo. O envio em si vai pelo gateway (gateway.ts).
import type { AttachmentKind, SentAttachment } from "./types";

/** Limite por arquivo (o gateway aceita até 25 MB de imagem e 50 MB de PDF; ficamos no menor para a conversa não travar). */
export const MAX_ATTACH_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 8;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp)$/i;

type FileLike = { name: string; type: string; size: number };

export function attachKind(f: Pick<FileLike, "name" | "type">): AttachmentKind {
  if (f.type.startsWith("image/") || IMAGE_EXT.test(f.name)) return "image";
  if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) return "pdf";
  return "file";
}

export function fmtSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
  return (bytes / 1024 / 1024).toFixed(1).replace(".", ",") + " MB";
}

/** Motivo (em português) para recusar o arquivo, ou null se pode anexar. */
export function checkAttachment(f: FileLike, already: number): string | null {
  if (already >= MAX_ATTACHMENTS) return `No máximo ${MAX_ATTACHMENTS} anexos por mensagem.`;
  if (f.size === 0) return `“${f.name}” está vazio.`;
  if (f.size > MAX_ATTACH_BYTES) return `“${f.name}” tem ${fmtSize(f.size)} — o limite é ${fmtSize(MAX_ATTACH_BYTES)}.`;
  if (attachKind(f) === "image" && !IMAGE_EXT.test(f.name) && !/^image\/(png|jpe?g|gif|webp|bmp)$/.test(f.type)) return `“${f.name}”: imagem em formato sem suporte. Use PNG, JPG, GIF, WebP ou BMP.`;
  return null;
}

/** Referências `@file:` na frente do pedido (o agente lê o arquivo pela referência). */
export const withRefs = (text: string, refs: string[] = []) => (refs.length ? refs.join(" ") + "\n\n" + text : text);

export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error ?? new Error("Não consegui ler o arquivo"));
    r.onload = () => (typeof r.result === "string" ? resolve(r.result) : reject(new Error("Não consegui ler o arquivo")));
    r.readAsDataURL(file);
  });
}

/** Erro do gateway → frase para o chip do anexo. */
export function attachError(message: string): string {
  if (/pdftoppm/i.test(message)) return "Este computador não tem o leitor de PDF (poppler) instalado.";
  if (/too large/i.test(message)) return `Arquivo grande demais (limite ${fmtSize(MAX_ATTACH_BYTES)}).`;
  if (/unsupported image/i.test(message)) return "Formato de imagem sem suporte.";
  if (/no session|session not found|not connected/i.test(message)) return "A conversa não está conectada. Tente de novo.";
  return message || "Não consegui anexar.";
}

/** Referências `@tipo:caminho` que a mensagem leva para o agente: o que a edição recoloca nos anexos que sobraram. */
export function refsOf(a: SentAttachment): string[] {
  if (a.ref) return [a.ref];
  // Enviado agora, sem recarregar: só temos os caminhos no servidor (PDF vira uma imagem por página).
  return (a.paths ?? []).map((p) => `@${a.kind === "pdf" ? "image" : a.kind}:${p}`);
}

const KIND_OF: Record<string, AttachmentKind> = { image: "image", file: "file", pdf: "pdf" };
const looksLikePath = (p: string) => /[\\/]/.test(p) || /\.\w{1,6}$/.test(p);

/** Nome do arquivo de um caminho (Windows ou Unix). */
export const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

/**
 * Referências `@image:<caminho> [rótulo]`, `@file:…`, `@pdf:…` que o envio põe no texto: viram chips (kind + nome)
 * e saem do texto, junto do "[rótulo]" que as acompanha (na mesma linha ou na linha de baixo). Linha só de referências aceita
 * caminho com espaço; no meio de uma frase, o caminho vai até o espaço. `names`: nome original do arquivo por nome no servidor.
 */
export function parseAttachRefs(text: string, names?: Record<string, string>): { text: string; attachments: SentAttachment[] } {
  if (!text.includes("@")) return { text, attachments: [] };
  const attachments: SentAttachment[] = [];
  const add = (kind: string, raw: string) => {
    const clean = raw.replace(/\s*\[[^\]\n]*\]\s*$/, "").trim();
    const path = clean.replace(/^["'`]|["'`]$/g, "");
    if (!path || !looksLikePath(path)) return false;
    const base = baseName(path);
    attachments.push({ name: names?.[base] ?? base, kind: KIND_OF[kind], ref: `@${kind}:${clean}` });
    return true;
  };
  const lines: string[] = [];
  let afterRef = false;
  for (const line of text.split("\n")) {
    if (afterRef && /^\s*\[[^\]\n]{1,60}\]\s*$/.test(line)) continue; // "[screenshot]" solto logo depois da referência
    const before = attachments.length;
    if (!/^\s*@(?:image|file|pdf):/.test(line)) lines.push(line.replace(/@(image|file|pdf):(\S+)(?:[ \t]+\[[^\]\n]*\])?/g, (all, k: string, p: string) => (add(k, p) ? "" : all)));
    else {
      // Linha só de referências: parte em cada "@tipo:" e tira o rótulo "[…]" do fim de cada uma.
      const parts = line.split(/(?=@(?:image|file|pdf):)/).filter((s) => s.trim());
      lines.push(
        parts
          .filter((part) => {
            const m = part.match(/^@(image|file|pdf):([\s\S]*)$/);
            return !(m && add(m[1], m[2]));
          })
          .join(" "),
      );
    }
    afterRef = attachments.length > before;
  }
  if (!attachments.length) return { text, attachments };
  return { text: lines.join("\n").replace(/^\s*\n/, "").replace(/\n{3,}/g, "\n\n").trim(), attachments };
}
