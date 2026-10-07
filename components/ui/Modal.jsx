"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Bottom sheet on phones, centred dialog on larger screens. Closes on Esc / backdrop.
//
// V2 FIX (mobile keyboard bug): the focus/scroll-lock effect used to depend on `onClose`. Callers such as the
// note editor pass a NEW function on every render (every keystroke), so the effect cleaned up and re-ran after
// each character: it re-focused the first field (title) and then restored focus to the previously focused
// element — blurring the textarea and dismissing the on-screen keyboard. `onClose` now lives in a ref and the
// effect depends on `open` only, so initial focus happens exactly once per opening.
export default function Modal({ open, onClose, title, children, wide = false, className = "", hideHead = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") closeRef.current?.(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      if (ref.current?.contains(document.activeElement)) return; // user already focused a field — don't steal it
      const el = ref.current?.querySelector("[autofocus],input,textarea,select,button"); el?.focus();
    }, 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; clearTimeout(t); prev?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) closeRef.current?.(); }}>
      <div ref={ref} className={`sheet ${wide ? "wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        {!hideHead && (
          <div className="sheet-head"><h2>{title}</h2>
            <button className="btn btn-ghost btn-icon" onClick={() => closeRef.current?.()} aria-label="Close"><X size={18} /></button></div>
        )}
        {children}
      </div>
    </div>
  );
}
