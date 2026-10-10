export const metadata = { title: "Offline" };
export default function Offline() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, textAlign: "center", background: "#0f1115", color: "#e8eaee", fontFamily: "system-ui, sans-serif", position: "relative", zIndex: 1 }}>
      <div style={{ maxWidth: 360 }}>
        <img src="/icons/icon-192.png" alt="" width="64" height="64" style={{ margin: "0 auto 16px", display: "block", borderRadius: 16 }} />
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>You&apos;re offline</h1>
        <p style={{ color: "#9aa0ab", lineHeight: 1.5, margin: "0 0 20px" }}>The app shell is installed, but your data lives in the cloud. Reconnect to see your tasks, notes and projects.</p>
        <a href="/dashboard" style={{ display: "inline-block", padding: "10px 18px", borderRadius: 10, background: "#e8310f", color: "#fff", textDecoration: "none", fontWeight: 600 }}>Try again</a>
      </div>
    </main>
  );
}
