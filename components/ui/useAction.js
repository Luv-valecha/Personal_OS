"use client";
import { useState, useTransition, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";

// Runs a server action, shows a toast on failure, exposes `pending`.
// run(() => createTask(data), { ok: "Task added" }) → resolves to the result data or null on failure.
export function useAction() {
  const toast = useToast(); const [pending, start] = useTransition(); const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, { ok } = {}) => {
    setBusy(true);
    try {
      const res = await fn();
      if (!res?.ok) { toast(res?.error || "Something went wrong", "err"); if (res?.code === "AUTH") window.location.href = "/login"; return null; }
      if (ok) toast(ok);
      return res.data ?? true;
    } catch { toast("Network problem — you may be offline. Try again.", "err"); return null; }
    finally { setBusy(false); }
  }, [toast]);
  return { run, pending: busy || pending, start };
}
