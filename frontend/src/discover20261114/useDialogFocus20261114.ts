// 2026-11-14 — native focus trap, scroll lock and a connected focus-return target.
import { useEffect, useRef } from "react";

export function useDialogFocus20261114() {
  const reference = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = reference.current;
    if (!element) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      const target = opener?.isConnected ? opener : document.querySelector<HTMLButtonElement>(".media-saved-trigger");
      target?.focus();
    };
  }, []);
  return reference;
}
