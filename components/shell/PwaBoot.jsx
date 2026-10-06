"use client";
import { useEffect } from "react";

// Registers the service worker (production only), stores the user's timezone in a cookie so the server can
// compute "today" correctly, and keeps <meta name="theme-color"> in sync with the active theme.
export default function PwaBoot() {
  useEffect(() => {
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && !document.cookie.includes("tz=" + tz)) document.cookie = `tz=${tz}; path=/; max-age=31536000; samesite=lax`; } catch {}
    const syncColor = () => {
      const c = getComputedStyle(document.documentElement).getPropertyValue("--c-bg").trim();
      let m = document.querySelector('meta[name="theme-color"]'); if (!m) { m = document.createElement("meta"); m.name = "theme-color"; document.head.appendChild(m); }
      if (c) m.content = c;
    };
    syncColor(); const mo = new MutationObserver(syncColor); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    return () => mo.disconnect();
  }, []);
  return null;
}
