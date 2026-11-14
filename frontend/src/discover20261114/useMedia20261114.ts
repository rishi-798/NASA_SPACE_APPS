// 2026-11-14 — abort stale requests; retries get independent state keys.
import { useEffect, useState } from "react";
import { mediaRequest } from "./mediaClient20261114";
import type { MediaPage } from "./mediaClient20261114";

type Reply = { key: string; data?: MediaPage; error?: string };

export function useMedia20261114(path: string | null) {
  const [revision, setRevision] = useState(0);
  const [reply, setReply] = useState<Reply>({ key: "" });
  const key = `${path}:${revision}`;
  useEffect(() => {
    if (!path) return;
    const controller = new AbortController();
    mediaRequest<MediaPage>(path, controller.signal).then(
      data => { if (!controller.signal.aborted) setReply({ key, data }); },
      error => { if (!controller.signal.aborted) setReply({ key, error: error instanceof Error ? error.message : "Please retry." }); },
    );
    return () => controller.abort();
  }, [key, path]);
  const current = reply.key === key ? reply : undefined;
  return { data: current?.data, error: current?.error,
    loading: Boolean(path && !current), retry: () => setRevision(value => value + 1) };
}
