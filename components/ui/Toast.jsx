"use client";
import { createContext, useCallback, useContext, useState } from "react";

const Ctx = createContext({ toast: () => {} });
export const useToast = () => useContext(Ctx).toast;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const toast = useCallback((message, type = "ok") => {
    const id = Math.random().toString(36).slice(2);
    setItems((a) => [...a.slice(-2), { id, message, type }]);
    setTimeout(() => setItems((a) => a.filter((t) => t.id !== id)), type === "err" ? 6000 : 3000);
  }, []);
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={`toast ${t.type === "err" ? "err" : ""}`}>{t.message}</div>)}
      </div>
    </Ctx.Provider>
  );
}
