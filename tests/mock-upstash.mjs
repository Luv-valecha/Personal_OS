// Minimal Upstash-REST-compatible server for tests (GET/SET EX/DEL/INCR, /pipeline, bearer auth) with fault injection.
// Control: POST /__mode {mode:"ok|429|500|slow|garbage"}, GET /__stats {commands, requests}, POST /__flush
import http from "node:http";
export function startMockUpstash({ port = 0, token = "test-token" } = {}) {
  const kv = new Map(); const st = { commands: 0, requests: 0, mode: "ok" };
  const exec = ([cmd, ...a]) => {
    st.commands++; const now = Date.now(); const get = (k) => { const e = kv.get(k); if (!e) return null; if (e.exp && e.exp <= now) { kv.delete(k); return null; } return e.v; };
    switch (String(cmd).toUpperCase()) {
      case "GET": return { result: get(a[0]) };
      case "SET": { let exp = 0; const i = a.findIndex((x) => String(x).toUpperCase() === "EX"); if (i > 1) exp = now + Number(a[i + 1]) * 1000; kv.set(a[0], { v: String(a[1]), exp }); return { result: "OK" }; }
      case "DEL": return { result: kv.delete(a[0]) ? 1 : 0 };
      case "INCR": { const n = Number(get(a[0]) || 0) + 1; kv.set(a[0], { v: String(n), exp: 0 }); return { result: n }; }
      default: return { error: `ERR unknown command '${cmd}'` };
    }
  };
  const server = http.createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c)); req.on("end", async () => {
      const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(typeof obj === "string" ? obj : JSON.stringify(obj)); };
      if (req.url === "/__stats") return send(200, { ...st, keys: kv.size });
      if (req.url === "/__flush") { kv.clear(); return send(200, {}); }
      if (req.url === "/__mode") { st.mode = JSON.parse(body).mode; return send(200, {}); }
      if (req.url === "/__dump") return send(200, [...kv.entries()].map(([k, e]) => [k, e.v]));
      if (req.url === "/__poke") { const { key, value } = JSON.parse(body); kv.set(key, { v: value, exp: 0 }); return send(200, {}); }
      st.requests++;
      if (req.headers.authorization !== `Bearer ${token}`) return send(401, { error: "Unauthorized" });
      if (st.mode === "429") return send(429, { error: "max requests limit exceeded" });
      if (st.mode === "500") return send(500, { error: "boom" });
      if (st.mode === "garbage") return send(200, "<html>not json</html>");
      if (st.mode === "slow") await new Promise((r) => setTimeout(r, 3000));
      let j; try { j = JSON.parse(body); } catch { return send(400, { error: "bad json" }); }
      if (req.url === "/pipeline") return send(200, j.map(exec));
      return send(200, exec(j));
    });
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port, url: `http://127.0.0.1:${server.address().port}`, token, stats: st, close: () => new Promise((r) => server.close(r)) })));
}
if (process.argv[1] && process.argv[1].endsWith("mock-upstash.mjs")) startMockUpstash({ port: Number(process.env.PORT) || 4020 }).then((m) => console.log("mock Upstash on", m.url));
