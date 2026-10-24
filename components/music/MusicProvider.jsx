"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { upsertTracks } from "@/actions/music";
import { describeFile, fingerprintOf, idbPut, idbGet, idbHas } from "@/lib/music-client";

// ONE <audio> element for the whole app (this provider lives in the persistent app shell, so route changes never
// remount it). Audio bytes stay in the browser: we only keep File objects / file handles locally and send *metadata*
// (title, artist, name, size) to the server.
const Ctx = createContext(null); export const useMusic = () => useContext(Ctx);
const KEY = "music-v1";

export default function MusicProvider({ children }) {
  const toast = useToast();
  const audio = useRef(null); const files = useRef(new Map()); const url = useRef(null); const hist = useRef([]); const loadSeq = useRef(0);
  const [meta, setMeta] = useState({});          // id → {title, artist, album, duration_sec, fingerprint, favorite}
  const [queue, setQueue] = useState([]); const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false); const [time, setTime] = useState(0); const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(0.8); const [shuffle, setShuffle] = useState(false); const [repeat, setRepeat] = useState("off");
  const [local, setLocal] = useState({});        // id → true when a File/handle is available on THIS device
  const [broken, setBroken] = useState({});      // id → true when playback failed / file inaccessible
  const [ready, setReady] = useState(false);
  const st = useRef({}); st.current = { queue, index, shuffle, repeat, meta };

  // restore preferences + queue snapshot (no autoplay)
  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(KEY) || "null"); if (s) { setQueue(s.queue?.map((q) => q.id) || []); setIndex(Math.min(s.index ?? -1, (s.queue?.length || 0) - 1)); setVolume(s.volume ?? 0.8); setShuffle(!!s.shuffle); setRepeat(s.repeat || "off");
      setMeta((m) => ({ ...m, ...Object.fromEntries((s.queue || []).map((q) => [q.id, { title: q.title, artist: q.artist, duration_sec: q.duration_sec }])) })); } } catch {}
    setReady(true);
  }, []);
  useEffect(() => { if (!ready) return; try { localStorage.setItem(KEY, JSON.stringify({ queue: queue.map((id) => ({ id, title: meta[id]?.title, artist: meta[id]?.artist, duration_sec: meta[id]?.duration_sec })), index, volume, shuffle, repeat })); } catch {} }, [queue, index, volume, shuffle, repeat, ready]); // eslint-disable-line
  useEffect(() => { if (audio.current) audio.current.volume = volume; }, [volume]);
  useEffect(() => { document.body.classList.toggle("has-mini", queue[index] != null); return () => document.body.classList.remove("has-mini"); }, [queue, index]);

  const getFile = useCallback(async (id) => {
    let ref = files.current.get(id);
    if (!ref) { const h = await idbGet(id); if (h) { ref = { handle: h }; files.current.set(id, ref); } }
    if (!ref) return null; if (ref instanceof File) return ref;
    try { let p = await ref.handle.queryPermission?.({ mode: "read" }); if (p !== "granted") p = await ref.handle.requestPermission?.({ mode: "read" }); if (p === "granted") return await ref.handle.getFile(); } catch {}
    return null;
  }, []);

  const loadIndex = useCallback(async (i, autoplay = true) => {
    const id = st.current.queue[i]; const a = audio.current; if (!a || id == null) return; const seq = ++loadSeq.current;
    setIndex(i); setTime(0); setDur(0);
    const f = await getFile(id); if (seq !== loadSeq.current) return;
    if (!f) { setBroken((b) => ({ ...b, [id]: true })); a.pause(); setPlaying(false); toast(`“${st.current.meta[id]?.title || "Track"}” isn't available on this device — locate the file in Music.`, "err"); return; }
    if (url.current) URL.revokeObjectURL(url.current); url.current = URL.createObjectURL(f); a.src = url.current; setBroken((b) => ({ ...b, [id]: false }));
    if (autoplay) { try { await a.play(); } catch (e) { if (e?.name !== "AbortError") { setPlaying(false); if (e?.name === "NotAllowedError") toast("Tap play to start (the browser blocks autoplay).", "err"); else setBroken((b) => ({ ...b, [id]: true })); } } }
  }, [getFile, toast]);

  const nextIndex = useCallback((dir = 1, fromEnd = false) => {
    const { queue: q, index: i, shuffle: sh, repeat: rp } = st.current; if (!q.length) return -1;
    if (fromEnd && rp === "one") return i;
    if (dir < 0) { if (sh && hist.current.length) return hist.current.pop(); return i > 0 ? i - 1 : (rp === "all" ? q.length - 1 : 0); }
    if (sh && q.length > 1) { hist.current.push(i); let r; do r = Math.floor(Math.random() * q.length); while (r === i); return r; }
    if (i + 1 < q.length) return i + 1; return rp === "all" || !fromEnd ? 0 : -1;
  }, []);
  const next = useCallback(() => { const n = nextIndex(1); if (n >= 0) loadIndex(n); }, [nextIndex, loadIndex]);
  const prev = useCallback(() => { const a = audio.current; if (a && a.currentTime > 3) { a.currentTime = 0; return; } const n = nextIndex(-1); if (n >= 0) loadIndex(n); }, [nextIndex, loadIndex]);

  // audio element wiring
  const onEnded = useCallback(() => { const n = nextIndex(1, true); if (n >= 0) loadIndex(n); else setPlaying(false); }, [nextIndex, loadIndex]);
  // Media Session (lock-screen / headset controls) where supported
  useEffect(() => {
    if (!("mediaSession" in navigator)) return; const m = meta[queue[index]];
    try { navigator.mediaSession.metadata = m ? new MediaMetadata({ title: m.title || "", artist: m.artist || "", album: m.album || "Lucifer Music" }) : null;
      navigator.mediaSession.setActionHandler("play", () => audio.current?.play()); navigator.mediaSession.setActionHandler("pause", () => audio.current?.pause());
      navigator.mediaSession.setActionHandler("nexttrack", next); navigator.mediaSession.setActionHandler("previoustrack", prev);
      navigator.mediaSession.setActionHandler("seekto", (d) => { if (audio.current && d.seekTime != null) audio.current.currentTime = d.seekTime; }); } catch {}
  }, [meta, queue, index, next, prev]);

  const api = {
    ready, meta, queue, index, current: queue[index] ?? null, playing, time, dur, volume, shuffle, repeat, local, broken,
    register(tracks) { setMeta((m) => ({ ...m, ...Object.fromEntries(tracks.map((t) => [t.id, { ...m[t.id], ...t }])) })); },   // merge: never drop fields (fingerprint, favorite…) another page already loaded
    async refreshLocal(ids) { const have = ids.filter((id) => files.current.has(id)); const stored = await idbHas(ids.filter((id) => !files.current.has(id))); setLocal((l) => ({ ...l, ...Object.fromEntries([...have, ...stored].map((id) => [id, true])) })); return [...have, ...stored]; },   // returns the ids playable on THIS device
    playTracks(ids, start = 0) { hist.current = []; st.current = { ...st.current, queue: ids }; setQueue(ids); loadIndex(start, true); },
    enqueue(id, atNext = false) { setQueue((q) => { if (!q.length) { st.current = { ...st.current, queue: [id] }; setTimeout(() => loadIndex(0, true), 0); return [id]; } const i = st.current.index; const n = [...q]; n.splice(atNext ? i + 1 : n.length, 0, id); return n; }); toast(atNext ? "Playing next" : "Added to queue"); },
    removeFromQueue(i) { setQueue((q) => { const n = q.filter((_, k) => k !== i); setIndex((cur) => (i < cur ? cur - 1 : i === cur ? Math.min(cur, n.length - 1) : cur)); if (i === st.current.index) { audio.current?.pause(); setPlaying(false); } return n; }); },
    moveInQueue(i, d) { setQueue((q) => { const j = i + d; if (j < 0 || j >= q.length) return q; const n = [...q]; [n[i], n[j]] = [n[j], n[i]]; setIndex((cur) => (cur === i ? j : cur === j ? i : cur)); return n; }); },
    clearQueue() { audio.current?.pause(); if (audio.current) audio.current.removeAttribute("src"); setQueue([]); setIndex(-1); setPlaying(false); setTime(0); setDur(0); },
    playIndex: (i) => loadIndex(i, true),
    toggle() { const a = audio.current; if (!a) return; if (!a.src && st.current.index >= 0) { loadIndex(st.current.index, true); return; } a.paused ? a.play().catch(() => {}) : a.pause(); },
    next, prev, seek(t) { if (audio.current) audio.current.currentTime = t; }, setVolume,
    toggleShuffle: () => setShuffle((s) => !s), cycleRepeat: () => setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off")),
    // Import: read metadata locally, send ONLY metadata to the server, keep the File/handle on this device.
    async importFiles(items) {   // items: [{file, handle?}]
      const described = []; for (const it of items) described.push({ it, d: await describeFile(it.file) });
      const out = []; for (let i = 0; i < described.length; i += 100) {
        const chunk = described.slice(i, i + 100); const r = await upsertTracks(chunk.map((c) => c.d)); if (!r.ok) throw new Error(r.error);
        for (const row of r.data) { const c = chunk.find((x) => x.d.fingerprint === row.fingerprint); if (c) { files.current.set(row.id, c.it.file); if (c.it.handle) { idbPut(row.id, c.it.handle); } } out.push(row); } }
      setLocal((l) => ({ ...l, ...Object.fromEntries(out.map((r) => [r.id, true])) })); setBroken((b) => ({ ...b, ...Object.fromEntries(out.map((r) => [r.id, false])) })); api.register(out); return out;
    },
    // Re-link picked files to known tracks by name|size, or force-link one file to a specific track.
    relink(pickedFiles, knownTracks, forceId = null) {
      let n = 0; const byFp = new Map(knownTracks.map((t) => [t.fingerprint, t.id]));
      for (const f of pickedFiles) { const id = forceId || byFp.get(fingerprintOf(f)); if (id) { files.current.set(id, f); n++; setLocal((l) => ({ ...l, [id]: true })); setBroken((b) => ({ ...b, [id]: false })); } }
      return n;
    },
    forget(id) { files.current.delete(id); setLocal((l) => { const n = { ...l }; delete n[id]; return n; }); },
  };
  return (<Ctx.Provider value={api}>{children}
    <audio ref={audio} preload="metadata" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onEnded={onEnded}
      onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)} onLoadedMetadata={(e) => setDur(e.currentTarget.duration)} onDurationChange={(e) => setDur(e.currentTarget.duration)}
      onError={() => { const id = st.current.queue[st.current.index]; if (id && audio.current?.src) { setBroken((b) => ({ ...b, [id]: true })); setPlaying(false); toast("That file can't be played in this browser (unsupported format or unreadable).", "err"); } }} />
  </Ctx.Provider>);
}
