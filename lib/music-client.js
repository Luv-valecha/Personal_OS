// Browser-only helpers for Lucifer Music: metadata reading (ID3v2 + file-name fallback), duration probing, IndexedDB for file handles.
export const AUDIO_EXT = /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|weba|webm|mp4)$/i;
export const fingerprintOf = (f) => `${f.name}|${f.size}`;
const stem = (n) => n.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();

export function guessFromName(name) {
  const s = stem(name).replace(/^\d{1,3}[\s.\-_)]+/, ""); const m = s.split(/\s[-–—]\s/);
  return m.length >= 2 ? { artist: m[0].trim(), title: m.slice(1).join(" - ").trim() } : { artist: "", title: s };
}
function decode(bytes, enc) {
  try { if (enc === 1) return new TextDecoder("utf-16").decode(bytes); if (enc === 2) return new TextDecoder("utf-16be").decode(bytes); if (enc === 3) return new TextDecoder("utf-8").decode(bytes); return new TextDecoder("latin1").decode(bytes); } catch { return ""; }
}
// Minimal ID3v2.3/2.4 reader for title/artist/album (no artwork, no network).
export async function readTags(file) {
  try {
    const buf = new Uint8Array(await file.slice(0, 262144).arrayBuffer()); if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return {};
    const ver = buf[3]; if (ver < 3) return {}; const synch = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
    const end = Math.min(buf.length, 10 + synch(buf, 6)); let o = 10; const out = {};
    while (o + 10 < end) {
      const id = String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]); if (!/^[A-Z0-9]{4}$/.test(id)) break;
      const size = ver === 4 ? synch(buf, o + 4) : (buf[o + 4] << 24) | (buf[o + 5] << 16) | (buf[o + 6] << 8) | buf[o + 7]; if (size <= 0 || o + 10 + size > buf.length) break;
      if (id === "TIT2" || id === "TPE1" || id === "TALB") { const enc = buf[o + 10]; const text = decode(buf.slice(o + 11, o + 10 + size), enc).replace(/\0/g, "").replace(/^\uFEFF/, "").trim(); out[id === "TIT2" ? "title" : id === "TPE1" ? "artist" : "album"] = text; }
      o += 10 + size;
    }
    return out;
  } catch { return {}; }
}
export function probeDuration(file) {
  return new Promise((resolve) => {
    const a = new Audio(); const url = URL.createObjectURL(file); let done = false; const fin = (v) => { if (done) return; done = true; URL.revokeObjectURL(url); a.src = ""; resolve(v); };
    a.preload = "metadata"; a.onloadedmetadata = () => fin(Number.isFinite(a.duration) ? Math.round(a.duration) : null); a.onerror = () => fin(null); setTimeout(() => fin(null), 4000); a.src = url;
  });
}
export async function describeFile(file) {
  const [tags, duration] = await Promise.all([readTags(file), probeDuration(file)]); const g = guessFromName(file.name);
  return { title: (tags.title || g.title || file.name).slice(0, 300), artist: (tags.artist || g.artist || "").slice(0, 200), album: (tags.album || "").slice(0, 200), duration_sec: duration, file_name: file.name.slice(0, 300), file_size: file.size, fingerprint: fingerprintOf(file) };
}
// Recursively collect audio files from a directory handle (File System Access API).
export async function collectFromDirectory(dirHandle, limit = 500) {
  const out = [];
  async function walk(d) { for await (const [name, h] of d.entries()) { if (out.length >= limit) return; if (h.kind === "file" && AUDIO_EXT.test(name)) out.push(h); else if (h.kind === "directory") await walk(h); } }
  await walk(dirHandle); return out;
}

// IndexedDB: persist FileSystemFileHandles (Chromium) so tracks can be re-opened after a restart (permission is re-requested by the browser).
const DB = "lucifer-music", STORE = "handles";
const open = () => new Promise((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore(STORE); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
export async function idbPut(id, handle) { try { const db = await open(); await new Promise((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(handle, id); t.oncomplete = res; t.onerror = () => rej(t.error); }); } catch {} }
export async function idbGet(id) { try { const db = await open(); return await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get(id); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch { return null; } }
export async function idbHas(ids) { try { const db = await open(); const keys = await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).getAllKeys(); r.onsuccess = () => res(r.result); r.onerror = () => res([]); }); const s = new Set(keys); return ids.filter((i) => s.has(i)); } catch { return []; } }
export async function idbDelete(id) { try { const db = await open(); db.transaction(STORE, "readwrite").objectStore(STORE).delete(id); } catch {} }
export const fmtTime = (s) => { if (!Number.isFinite(s) || s < 0) return "0:00"; const m = Math.floor(s / 60); return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`; };
