import { useEffect, useRef } from "react";

/** Ao abrir um bloco no fim da conversa, rola de leve até ele aparecer inteiro (sem ficar atrás do campo de mensagem). */
export function useReveal<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const was = useRef(open);
  useEffect(() => {
    if (open && !was.current) {
      const reduce = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
      ref.current?.scrollIntoView?.({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    }
    was.current = open;
  }, [open]);
  return ref;
}
