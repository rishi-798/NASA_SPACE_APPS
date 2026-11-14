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
    const keepFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = Array.from(element.querySelectorAll<HTMLElement>(
        'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )).filter(control => control.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); element.focus(); return; }
      const outside = !element.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || outside)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || outside)) {
        event.preventDefault(); first.focus();
      }
    };
    element.addEventListener("keydown", keepFocus);
    return () => {
      element.removeEventListener("keydown", keepFocus);
      element.close();
      document.body.style.overflow = overflow;
      const target = opener?.isConnected ? opener : document.querySelector<HTMLButtonElement>(".media-saved-trigger");
      target?.focus();
    };
  }, []);
  return reference;
}
