"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Sparkles, ArrowUp, X, Check, AlertTriangle, HelpCircle, Mic, Square, Volume2, VolumeX } from "lucide-react";
import { createVoice } from "@/lib/voice";
import { useFocus } from "@/components/shell/FocusProvider";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
const MAX_HISTORY = 8;

function Cards({ cards }) {
  return cards.map((c, i) => c.type === "list" ? (
    <div key={i} className="card" style={{ padding: 10, background: "var(--color-surface-elevated)" }}>
      <div className="small" style={{ fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
      {c.items.length === 0 ? <div className="small muted">Nothing found.</div> : c.items.map((it, j) => <Link key={j} href={it.href || "#"} className="list-row small" style={{ minHeight: 32, padding: "4px 2px" }}><span className="grow trunc">{it.text}</span>{it.sub && <span className="muted trunc" style={{ maxWidth: "45%" }}>{it.sub}</span>}</Link>)}
      {c.note && <div className="small muted mt-1">{c.note}</div>}</div>
  ) : (
    <div key={i} className="card" style={{ padding: 10, background: "var(--color-surface-elevated)" }}>
      <div style={{ fontWeight: 600 }}>{c.title}</div>{c.lines.map((l, j) => <div key={j} className="small muted">{l}</div>)}
      {c.links?.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{c.links.map((l) => <Link key={l.href + l.label} href={l.href} className="btn btn-sm">{l.label}</Link>)}</div>}</div>));
}

// Compact assistant: one input row at the top of the dashboard; the response panel only exists while there is a response.
export default function JarvisBar() {
  const focus = useFocus(); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null); const [history, setHistory] = useState([]); const [status, setStatus] = useState(null);
  // Voice (browser-native; see lib/voice.js). Voice text only fills the input — it goes through the SAME send() / endpoint / confirmations as typing.
  const [vs, setVs] = useState(null); const voice = useRef(null);
  useEffect(() => {
    let storage = null; try { storage = window.localStorage; } catch {}
    const v = createVoice({ win: window, storage, onChange: setVs, onTranscript: (t) => { setText(t); setTimeout(() => input.current?.focus(), 0); } }); voice.current = v; setVs(v.state);
    return () => v.dispose();
  }, []);
  const listening = vs?.input === "listening";
  const toggleMic = () => (listening ? voice.current?.stopListening() : voice.current?.startListening());
  const inflight = useRef(false); const input = useRef(null); const ridRef = useRef(null);
  useEffect(() => { fetch("/api/jarvis").then((r) => (r.ok ? r.json() : null)).then((j) => j && setStatus(j)).catch(() => {}); }, []);
  useEffect(() => { if (window.location.hash === "#jarvis") input.current?.focus(); }, []);

  async function send(body, userText) {
    if (inflight.current) return; inflight.current = true; setBusy(true);
    const requestId = ridRef.current || uid(); ridRef.current = requestId; // same id on accidental double-submit → server returns the first result
    try {
      const r = await fetch("/api/jarvis", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, requestId, history }) });
      if (r.status === 401) { window.location.href = "/login"; return; }
      const j = await r.json().catch(() => ({ type: "error", text: "Unexpected response from the server.", cards: [] }));
      setRes(j); voice.current?.speak(j);   // only speaks if the user turned spoken replies on
      for (const a of j.clientActions || []) {
        if (a.type === "focus" && focus) focus.start("focus", a.minutes, a.label, a.taskId);
        if (a.type === "theme" && typeof a.theme === "string") { document.documentElement.setAttribute("data-theme", a.theme); document.documentElement.removeAttribute("style"); }   // server already validated + saved it
      }
      if (userText) setHistory((h) => [...h, { role: "user", text: userText }, { role: "assistant", text: j.text || "" }].slice(-MAX_HISTORY));
      if (j.type !== "clarify" && j.type !== "confirm") setHistory((h) => h.slice(-2)); // keep only the last exchange once a request is finished
      if (j.type !== "error") setText("");
    } catch { setRes({ type: "error", text: "Couldn't reach the server — you may be offline.", cards: [] }); }
    finally { inflight.current = false; ridRef.current = null; setBusy(false); setTimeout(() => input.current?.focus(), 0); }
  }
  const submit = (e) => { e.preventDefault(); const t = text.trim(); if (!t || busy) return; voice.current?.cancelListening(); voice.current?.stopSpeaking(); send({ message: t }, t); };
  const clear = () => { setRes(null); setHistory([]); };
  const clarifying = res?.type === "clarify" || (res?.type === "answer" && /\?\s*$/.test(res.text || "")); const icon = res?.type === "error" ? <AlertTriangle size={14} /> : clarifying ? <HelpCircle size={14} /> : <Check size={14} />;
  return (
    <section id="jarvis" aria-label="JARVIS assistant" style={{ marginBottom: 14 }}>
      <form onSubmit={submit} className="card flex items-center gap-2" style={{ padding: "6px 6px 6px 12px", borderColor: busy ? "var(--color-primary)" : undefined }}>
        <Sparkles size={16} style={{ color: "var(--color-primary)", flex: "none" }} aria-hidden />
        <strong className="hidden sm:inline" style={{ fontSize: 12, letterSpacing: ".08em", color: "var(--color-text-muted)" }}>JARVIS</strong>
        <input ref={input} className="input" style={{ border: 0, background: "none", boxShadow: "none", minHeight: 38 }} value={text} onChange={(e) => setText(e.target.value)} maxLength={600} disabled={busy && false}
          placeholder={listening ? "Listening…" : clarifying ? "Your answer…" : "Ask anything or tell me what to do…"} aria-label="Ask JARVIS" autoComplete="off" enterKeyHint="send"
          onKeyDown={(e) => { if (e.key === "Escape") { voice.current?.cancelListening(); voice.current?.stopSpeaking(); } }} />
        <button type="button" className="btn btn-ghost btn-icon" onClick={toggleMic} disabled={busy} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak to JARVIS"} title={vs?.support.input === false ? "Voice input isn’t supported in this browser" : listening ? "Stop listening" : "Speak (text appears here for you to review)"} style={listening ? { color: "var(--color-primary)", borderRadius: 999 } : { borderRadius: 999 }}>{listening ? <Square size={15} /> : <Mic size={17} />}</button>
        {vs?.support.output && <button type="button" className="btn btn-ghost btn-icon" onClick={() => (vs.speaking ? voice.current.stopSpeaking() : voice.current.setSpeak(!vs.prefs.speak))} aria-pressed={vs.prefs.speak} aria-label={vs.speaking ? "Stop speaking" : vs.prefs.speak ? "Turn spoken replies off" : "Turn spoken replies on"} title={vs.speaking ? "Stop speaking" : vs.prefs.speak ? "Spoken replies: on" : "Spoken replies: off"} style={{ borderRadius: 999, ...(vs.prefs.speak ? { color: "var(--color-primary)" } : {}) }}>{vs.speaking ? <Square size={15} /> : vs.prefs.speak ? <Volume2 size={17} /> : <VolumeX size={17} />}</button>}
        <button className="btn btn-primary btn-icon" style={{ borderRadius: 999 }} disabled={busy || !text.trim()} aria-label={busy ? "JARVIS is working" : "Send to JARVIS"}>{busy ? <span className="loader" style={{ width: 16, height: 16, borderWidth: 2 }} /> : <ArrowUp size={17} />}</button>
      </form>
      <div aria-live="polite" role="status">{(vs?.interim || (vs?.message && vs.input !== "idle")) && <p className="small muted" style={{ margin: "4px 4px 0" }}>{vs.interim ? `Hearing: “${vs.interim}”` : vs.message}{vs.input === "denied" || vs.input === "error" || vs.input === "unsupported" || vs.input === "cancelled" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => voice.current.dismissMessage()}>OK</button> : null}</p>}</div>
      {vs?.prefs.speak && vs.voices.length > 0 && <details className="small" style={{ margin: "4px 4px 0" }}><summary className="muted" style={{ cursor: "pointer" }}>Voice settings</summary><div className="flex items-center gap-2" style={{ flexWrap: "wrap", marginTop: 6 }}>
        <select className="select" style={{ width: "auto", maxWidth: 220 }} value={vs.prefs.voiceURI} onChange={(e) => voice.current.setVoice(e.target.value)} aria-label="Voice"><option value="">Default voice</option>{vs.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}</select>
        <label className="flex items-center gap-2">Speed <input type="range" min="0.7" max="1.5" step="0.1" value={vs.prefs.rate} onChange={(e) => voice.current.setRate(e.target.value)} aria-label="Speaking speed" /></label>
        <span className="muted">Saved on this device. Replies are spoken by your device — nothing is sent to a speech service.</span></div></details>}
      {status && !status.configured && !res && <p className="small muted" style={{ margin: "4px 4px 0" }}>AI is off (no Gemini key) — quick commands still work: “add task: …”, “Rahul owes me 300 for lunch”, “start 45 minute focus”.</p>}
      {res && (
        <div className="card mt-2" style={{ padding: 12 }} role="status" aria-live="polite">
          <div className="flex items-start gap-2">
            <span style={{ color: res.type === "error" ? "var(--c-red)" : "var(--color-primary)", paddingTop: 3 }}>{icon}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="small muted" style={{ letterSpacing: ".06em", fontSize: 11 }}>JARVIS RESPONSE{res.via === "rules" ? " · quick command" : ""}</div>
              <div style={{ margin: "2px 0 8px", whiteSpace: "pre-wrap" }}>{res.text}</div>
              {res.cards?.length > 0 && <div className="flex flex-col gap-2"><Cards cards={res.cards} /></div>}
              {res.type === "confirm" && <div className="flex gap-2 mt-2"><button className="btn btn-primary btn-sm" disabled={busy} onClick={() => send({ confirmToken: res.confirm.token }, null)}>Confirm</button><button className="btn btn-sm" onClick={clear}>Cancel</button></div>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={clear} aria-label="Dismiss response"><X size={15} /></button>
          </div></div>)}
    </section>);
}
