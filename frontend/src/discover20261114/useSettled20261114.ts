// 2026-11-14 — wait for typing to settle before contacting NASA.
import { useEffect, useState } from "react";

export function useSettled20261114(value: string, delay = 400) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
