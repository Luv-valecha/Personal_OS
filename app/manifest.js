export default function manifest() {
  return {
    id: "/", name: "Lucifer's OS", short_name: "Lucifer OS", version: "4.0.1",
    description: "A minimal personal operating system.",
    start_url: "/dashboard", scope: "/", display: "standalone", orientation: "any",
    background_color: "#0a0305", theme_color: "#0a0305", categories: ["productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add task", url: "/tasks?add=task", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Add note", url: "/notes?add=note", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Start focus", url: "/focus?start=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
