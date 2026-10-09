// Anexos da Conversa: tipo, limites e leitura do arquivo. O envio em si vai pelo gateway (gateway.ts).
import type { AttachmentKind } from "./types";

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
