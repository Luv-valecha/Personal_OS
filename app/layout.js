import "@/styles/globals.css";
import PwaBoot from "@/components/shell/PwaBoot";
import { cookies } from "next/headers";
import { getUserId } from "@/lib/auth";
import { getSettings, getCustomTheme } from "@/lib/server-utils";
import { customThemeStyle, isThemeId, MOTION, GLASS } from "@/lib/themes";

export const metadata = {
  title: { default: "Lucifer's OS", template: "%s · Lucifer's OS" },
  description: "A minimal personal operating system for tasks, notes, projects, money and focus.",
  applicationName: "Lucifer's OS",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Lucifer OS", statusBarStyle: "black-translucent" },
  icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }, { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};
export const viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0a0305", colorScheme: "dark light" };

export default async function RootLayout({ children }) {
  const jar = await cookies();
  let theme = jar.get("theme")?.value, motion = jar.get("motion")?.value, glass = jar.get("glass")?.value, style;
  const uid = await getUserId().catch(() => null);
  if (uid) { // logged in: the database is the source of truth (survives logout/login and new devices)
    try {
      const s = await getSettings(uid); theme = s.theme; motion = s.motion; glass = s.glass ?? glass;   // ?? keeps the device cookie if the DB has no value (migration 009 pending)
      if (theme === "custom") style = customThemeStyle(await getCustomTheme(uid, s.active_custom_theme));
    } catch {}
  }
  if (!isThemeId(theme)) theme = "dark"; if (!MOTION.includes(motion)) motion = "full"; if (!GLASS.includes(glass)) glass = "off";
  return (
    <html lang="en" data-theme={theme} data-motion={motion} data-glass={glass} style={style} suppressHydrationWarning>
      <body><a href="#main" className="sr-only">Skip to content</a>{children}<PwaBoot /></body>
    </html>
  );
}
