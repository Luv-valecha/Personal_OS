"use client";
import Link from "next/link";
import { Play, Pause, SkipBack, SkipForward, X, Music2 } from "lucide-react";
import { useMusic } from "@/components/music/MusicProvider";
import { fmtTime } from "@/lib/music-client";

export default function MiniPlayer() {
  const m = useMusic(); if (!m || m.current == null) return null; const t = m.meta[m.current] || {}; const broken = m.broken[m.current]; const d = Number.isFinite(m.dur) && m.dur > 0 ? m.dur : t.duration_sec || 0;
  return (
    <div className="mini-player" role="region" aria-label="Music player">
      <Link href="/music" className="mini-art" aria-label="Open music library"><Music2 size={16} /></Link>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="trunc" style={{ fontSize: 13, fontWeight: 600 }}>{t.title || "Track"}{broken && <span className="chip ml-2" style={{ color: "var(--c-red)" }}>unavailable</span>}</div>
        <div className="flex items-center gap-2"><span className="small muted" style={{ fontSize: 10, width: 30 }}>{fmtTime(m.time)}</span>
          <input type="range" min="0" max={d || 1} step="1" value={Math.min(m.time, d || 1)} onChange={(e) => m.seek(Number(e.target.value))} aria-label="Seek" style={{ flex: 1, minWidth: 0 }} disabled={!d} />
          <span className="small muted hidden sm:inline" style={{ fontSize: 10, width: 30 }}>{fmtTime(d)}</span></div></div>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={m.prev} aria-label="Previous track"><SkipBack size={16} /></button>
      <button className="btn btn-primary btn-icon" style={{ borderRadius: 999 }} onClick={m.toggle} aria-label={m.playing ? "Pause" : "Play"}>{m.playing ? <Pause size={16} /> : <Play size={16} />}</button>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={m.next} aria-label="Next track"><SkipForward size={16} /></button>
      <button className="btn btn-ghost btn-icon btn-sm hidden sm:inline-flex" onClick={m.clearQueue} aria-label="Close player"><X size={15} /></button>
    </div>);
}
