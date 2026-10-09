import { useEffect, type RefObject } from "react";

/** Fecha o popover com Esc ou clique fora (devolve o foco a quem abriu pelo `onClose`). */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    const down = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    window.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      window.removeEventListener("keydown", key);
    };
  }, [ref, onClose]);
}
