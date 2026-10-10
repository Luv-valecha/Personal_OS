"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Play, Pause, Star, Plus, Trash2, FolderOpen, FilePlus2, ListMusic, ArrowUp, ArrowDown, Shuffle, Repeat, Repeat1, Volume2, X, ListPlus, FileSearch } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Segmented } from "@/components/ui/Fields";
import { Empty, ErrorBox } from "@/components/ui/misc";
import { useMusic } from "@/components/music/MusicProvider";
import { useAction } from "@/components/ui/useAction";
import { useToast } from "@/components/ui/Toast";
import { toggleFavoriteTrack, deleteTrack, createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, reorderPlaylist } from "@/actions/music";
import { AUDIO_EXT, collectFromDirectory, fmtTime, idbDelete } from "@/lib/music-client";

const ACCEPT = "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus,.flac";
export default function MusicClient({ tracks, playlists }) {
  const m = useMusic(); const toast = useToast(); const { run } = useAction();
  const [tab, setTab] = useState("library"); const [q, setQ] = useState(""); const [openPl, setOpenPl] = useState(""); const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const fileIn = useRef(null), dirIn = useRef(null), relinkIn = useRef(null), relinkOne = useRef(null);
  const byId = useMemo(() => Object.fromEntries(tracks.map((t) => [t.id, t])), [tracks]);
  useEffect(() => { m.register(tracks); m.refreshLocal(tracks.map((t) => t.id)); }, [tracks]); // eslint-disable-line
  const fsa = typeof window !== "undefined" && "showOpenFilePicker" in window; const dirApi = typeof window !== "undefined" && "showDirectoryPicker" in window;

  async function doImport(items) {
    if (!items.length) { setErr("No audio files found."); return; } setErr(""); setBusy(`Reading ${items.length} file${items.length > 1 ? "s" : ""}…`);
    try { const out = await m.importFiles(items.slice(0, 500)); toast(`${out.length} track${out.length === 1 ? "" : "s"} added (files stay on this device)`); } catch (e) { setErr(e.message || "Import failed"); } setBusy("");
  }
  async function pickFiles() {
    if (fsa) { try { const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: "Audio", accept: { "audio/*": [".mp3", ".m4a", ".aac", ".wav", ".ogg", ".opus", ".flac"] } }] }); return doImport(await Promise.all(hs.map(async (h) => ({ file: await h.getFile(), handle: h })))); } catch (e) { if (e?.name === "AbortError") return; } }
    fileIn.current?.click();
  }
  async function pickFolder() {
    if (dirApi) { try { const d = await window.showDirectoryPicker({ mode: "read" }); setBusy("Scanning folder…"); const hs = await collectFromDirectory(d); return doImport(await Promise.all(hs.map(async (h) => ({ file: await h.getFile(), handle: h })))); } catch (e) { setBusy(""); if (e?.name === "AbortError") return; } }
    dirIn.current?.click();
  }
  const fromInput = (e) => { const fs = [...e.target.files].filter((f) => f.type.startsWith("audio/") || AUDIO_EXT.test(f.name)); e.target.value = ""; doImport(fs.map((file) => ({ file }))); };
  const relinkAll = (e) => { const fs = [...e.target.files]; e.target.value = ""; const n = m.relink(fs, tracks); toast(n ? `${n} file${n > 1 ? "s" : ""} re-linked` : "None of those files matched your library (matching uses file name + size).", n ? "ok" : "err"); };
  const relinkSingle = (e) => { const f = e.target.files[0]; const id = relinkOne.current; e.target.value = ""; if (!f || !id) return; const t = byId[id]; if (t && `${f.name}|${f.size}` !== t.fingerprint && !confirm("This file has a different name or size than the original. Use it for this track anyway?")) return; m.relink([f], tracks, id); toast("File linked"); };

  const missing = tracks.filter((t) => !m.local[t.id]).length;
  const list = (ids) => ids.map((id) => byId[id]).filter(Boolean);
  const filtered = tracks.filter((t) => !q || (t.title + " " + t.artist + " " + t.album).toLowerCase().includes(q.toLowerCase()));
  const shown = tab === "favorites" ? filtered.filter((t) => t.favorite) : filtered;
  const play = (arr, i) => m.playTracks(arr.map((t) => t.id), i);

  function Row({ t, arr, i, extra }) {
    const here = !!m.local[t.id]; const cur = m.current === t.id; const bad = m.broken[t.id];
    return (<div className="list-row" style={{ background: cur ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : undefined }}>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => (cur ? m.toggle() : play(arr, i))} aria-label={cur && m.playing ? `Pause ${t.title}` : `Play ${t.title}`}>{cur && m.playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <div className="grow" style={{ minWidth: 0 }}><div className="trunc">{t.title}</div><div className="small muted trunc">{[t.artist, t.album].filter(Boolean).join(" · ") || t.file_name}</div></div>
      {(!here || bad) && <span className="chip" style={{ color: "var(--c-orange)" }} title="This file isn't accessible on this device">{bad ? "can't play" : "not on this device"}</span>}
      {(!here || bad) && <button className="btn btn-sm" onClick={() => { relinkOne.current = t.id; relinkIn.current?.click(); }}><FileSearch size={13} /> Locate</button>}
      <span className="small muted hidden sm:inline" style={{ width: 38, textAlign: "right" }}>{fmtTime(t.duration_sec)}</span>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => run(() => toggleFavoriteTrack(t.id))} aria-pressed={t.favorite} aria-label={t.favorite ? `Unfavourite ${t.title}` : `Favourite ${t.title}`}><Star size={15} fill={t.favorite ? "var(--color-accent)" : "none"} color={t.favorite ? "var(--color-accent)" : "currentColor"} /></button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => m.enqueue(t.id)} aria-label={`Add ${t.title} to queue`} title="Add to queue"><ListPlus size={15} /></button>
      {playlists.length > 0 && <select className="select" style={{ width: 34, minHeight: 28, padding: 0, textAlign: "center" }} value="" aria-label={`Add ${t.title} to playlist`} onChange={async (e) => { const id = e.target.value; if (!id) return; const r = await run(() => addToPlaylist(id, [t.id])); if (r) toast(r.added ? "Added to playlist" : "Already in that playlist"); }}><option value="">＋</option>{playlists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
      {extra}
      <button className="btn btn-ghost btn-icon btn-sm" onClick={async () => { if (confirm(`Remove “${t.title}” from your library? (Your file isn't touched.)`)) { m.forget(t.id); idbDelete(t.id); await run(() => deleteTrack(t.id), { ok: "Removed from library" }); } }} aria-label={`Remove ${t.title} from library`}><Trash2 size={14} /></button></div>);
  }
  const pl = playlists.find((p) => p.id === openPl);
  return (<>
    <PageHead title="Lucifer Music" sub="Plays audio files from this device. Nothing is uploaded — the server only stores titles and playlists.">
      <button className="btn btn-primary" onClick={pickFiles} disabled={!!busy}><FilePlus2 size={16} /> Add files</button>
      <button className="btn" onClick={pickFolder} disabled={!!busy}><FolderOpen size={16} /> Add folder</button></PageHead>
    <input ref={fileIn} type="file" multiple accept={ACCEPT} className="sr-only" onChange={fromInput} aria-label="Choose audio files" />
    <input ref={dirIn} type="file" multiple webkitdirectory="" directory="" className="sr-only" onChange={fromInput} aria-label="Choose a music folder" />
    <input ref={relinkIn} type="file" accept={ACCEPT} className="sr-only" onChange={relinkSingle} aria-label="Locate file" />
    <input type="file" multiple accept={ACCEPT} className="sr-only" id="relink-many" onChange={relinkAll} aria-label="Re-link files" />
    {busy && <p className="small muted" role="status">{busy}</p>}{err && <div className="mb-3"><ErrorBox>{err}</ErrorBox></div>}
    {missing > 0 && tracks.length > 0 && <div className="card mb-3 flex items-center gap-3 flex-wrap" style={{ padding: 10 }}><span className="small grow">{missing} track{missing > 1 ? "s are" : " is"} not available on this device. Playlists sync between devices, but each device needs its own copy of the audio files.</span>
      <label htmlFor="relink-many" className="btn btn-sm" style={{ cursor: "pointer" }}><FileSearch size={13} /> Re-link files / folder contents</label></div>}
    <div className="flex flex-wrap items-center gap-3 mb-3"><Segmented value={tab} onChange={setTab} label="Music sections" options={[{ value: "library", label: `Library ${tracks.length}` }, { value: "playlists", label: "Playlists" }, { value: "favorites", label: "Favorites" }, { value: "queue", label: `Queue ${m.queue.length}` }]} />
      {(tab === "library" || tab === "favorites") && <input className="input" style={{ maxWidth: 240 }} placeholder="Search tracks…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tracks" />}</div>

    {(tab === "library" || tab === "favorites") && <div className="card" style={{ padding: 8 }}>
      {shown.length === 0 ? <Empty title={tab === "favorites" ? "No favourites yet" : tracks.length ? "No matches" : "Your library is empty"} hint={tab === "favorites" ? "Tap the star on a track." : tracks.length ? "Try a different search." : "Add audio files or a folder from this device to get started."} /> :
        <>{shown.length > 1 && <div className="flex gap-2 p-2"><button className="btn btn-sm btn-primary" onClick={() => play(shown, 0)}><Play size={14} /> Play all</button><button className="btn btn-sm" onClick={() => { const a = [...shown].sort(() => Math.random() - 0.5); play(a, 0); }}><Shuffle size={14} /> Shuffle</button></div>}
          {shown.slice(0, 300).map((t, i) => <Row key={t.id} t={t} arr={shown} i={i} />)}{shown.length > 300 && <p className="small muted p-2">Showing the first 300 — use search to narrow down.</p>}</>}</div>}

    {tab === "playlists" && <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      <div className="card" style={{ padding: 8, alignSelf: "start" }}>
        <form className="flex gap-2 p-2" onSubmit={async (e) => { e.preventDefault(); const f = e.currentTarget; const n = new FormData(f).get("n"); const r = await run(() => createPlaylist(n), { ok: "Playlist created" }); if (r) { f.reset(); setOpenPl(r.id); } }}><input name="n" className="input" placeholder="New playlist" aria-label="New playlist name" maxLength={80} /><button className="btn btn-primary btn-icon" aria-label="Create playlist"><Plus size={16} /></button></form>
        {playlists.length === 0 ? <Empty title="No playlists" /> : playlists.map((p) => <button key={p.id} className="list-row w-full text-left" style={{ background: openPl === p.id ? "color-mix(in srgb, var(--color-primary) 12%, transparent)" : "none", border: 0, color: "inherit", font: "inherit", cursor: "pointer" }} onClick={() => setOpenPl(p.id)}><ListMusic size={15} className="muted" /><span className="grow trunc">{p.name}</span><span className="small muted">{p.track_ids.length}</span></button>)}</div>
      <div className="card" style={{ padding: 8 }}>{!pl ? <Empty title="Select a playlist" hint="Add tracks from the Library with the ＋ menu." /> : (<>
        <div className="flex items-center gap-2 p-2 flex-wrap"><h2 style={{ fontSize: 17 }} className="grow">{pl.name}</h2>
          <button className="btn btn-sm btn-primary" disabled={!pl.track_ids.length} onClick={() => play(list(pl.track_ids), 0)}><Play size={14} /> Play</button>
          <button className="btn btn-sm" onClick={async () => { const n = prompt("Rename playlist", pl.name); if (n && n.trim()) await run(() => renamePlaylist(pl.id, n), { ok: "Renamed" }); }}>Rename</button>
          <button className="btn btn-sm btn-danger" onClick={async () => { if (confirm(`Delete playlist “${pl.name}”? Your tracks stay in the library.`)) { await run(() => deletePlaylist(pl.id), { ok: "Playlist deleted" }); setOpenPl(""); } }}>Delete</button></div>
        {pl.track_ids.length === 0 ? <Empty title="Empty playlist" hint="Use the ＋ menu on any library track." /> : list(pl.track_ids).map((t, i, arr) => <Row key={t.id} t={t} arr={arr} i={i} extra={<>
          <button className="btn btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => { const ids = [...pl.track_ids]; [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]; run(() => reorderPlaylist(pl.id, ids)); }} aria-label={`Move ${t.title} up`}><ArrowUp size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" disabled={i === arr.length - 1} onClick={() => { const ids = [...pl.track_ids]; [ids[i + 1], ids[i]] = [ids[i], ids[i + 1]]; run(() => reorderPlaylist(pl.id, ids)); }} aria-label={`Move ${t.title} down`}><ArrowDown size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => run(() => removeFromPlaylist(pl.id, t.id))} aria-label={`Remove ${t.title} from playlist`}><X size={14} /></button></>} />)}</>)}</div></div>}

    {tab === "queue" && <div className="card" style={{ padding: 8 }}>
      <div className="flex items-center gap-2 p-2 flex-wrap">
        <button className={`btn btn-sm ${m.shuffle ? "btn-primary" : ""}`} onClick={m.toggleShuffle} aria-pressed={m.shuffle}><Shuffle size={14} /> Shuffle</button>
        <button className={`btn btn-sm ${m.repeat !== "off" ? "btn-primary" : ""}`} onClick={m.cycleRepeat} aria-label={`Repeat: ${m.repeat}`}>{m.repeat === "one" ? <Repeat1 size={14} /> : <Repeat size={14} />} Repeat {m.repeat}</button>
        <label className="flex items-center gap-2 small muted"><Volume2 size={14} /><input type="range" min="0" max="1" step="0.05" value={m.volume} onChange={(e) => m.setVolume(Number(e.target.value))} aria-label="Volume" style={{ width: 110 }} /></label>
        <span className="grow" />{m.queue.length > 0 && <button className="btn btn-sm btn-ghost" onClick={m.clearQueue}>Clear queue</button>}</div>
      {m.queue.length === 0 ? <Empty title="Queue is empty" hint="Play a track or add some with the list-plus button." /> : m.queue.map((id, i) => { const t = m.meta[id] || {}; return (
        <div key={id + i} className="list-row" style={{ background: i === m.index ? "color-mix(in srgb, var(--color-primary) 10%, transparent)" : undefined }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => (i === m.index ? m.toggle() : m.playIndex(i))} aria-label={`Play ${t.title}`}>{i === m.index && m.playing ? <Pause size={15} /> : <Play size={15} />}</button>
          <div className="grow" style={{ minWidth: 0 }}><div className="trunc">{t.title || "Track"}</div><div className="small muted trunc">{t.artist}</div></div>
          <button className="btn btn-ghost btn-icon btn-sm" disabled={i === 0} onClick={() => m.moveInQueue(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" disabled={i === m.queue.length - 1} onClick={() => m.moveInQueue(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => m.removeFromQueue(i)} aria-label="Remove from queue"><X size={14} /></button></div>); })}</div>}
    <p className="small muted mt-4" style={{ maxWidth: 680 }}>Notes: audio files never leave this device. Playlists, favourites and track info sync through your account, but on another device you must add (or re-link) the same files. Browsers that support the File System Access API (Chrome/Edge on desktop) can re-open files after a restart; others (Android, iPhone, Firefox) keep files only until you close the tab. Background playback depends on your browser and OS.</p>
  </>);
}
