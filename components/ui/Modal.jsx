"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

// Bottom sheet on phones, centred dialog on larger screens. Closes on Esc / backdrop. Traps focus loosely.
export default function Modal({ open, onClose, title, children, wide = false, className = "", hideHead = false }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => { const el = ref.current?.querySelector("[autofocus],input,textarea,select,button"); el?.focus(); }, 30);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; clearTimeout(t); prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`sheet ${wide ? "wide" : ""} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        {!hideHead && (
          <div className="sheet-head"><h2>{title}</h2>
            <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        )}
        {children}
      </div>
    </div>
  );
}
