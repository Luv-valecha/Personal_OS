"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Download, Trash2, FileText } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import { Empty, Tags, ErrorBox } from "@/components/ui/misc";
import { ProjectSelect } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { useToast } from "@/components/ui/Toast";
import { deleteFile } from "@/actions/settings";
import { fmtDate } from "@/lib/dates";

const size = (b) => b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`;
export default function FilesClient({ files, projects, maxMb }) {
  const router = useRouter(); const toast = useToast(); const { run } = useAction(); const input = useRef(null);
  const [tags, setTags] = useState(""); const [project, setProject] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [q, setQ] = useState(""); const [last, setLast] = useState(null);
  useEffect(() => { if (new URLSearchParams(window.location.search).get("upload") === "1") { setTimeout(() => input.current?.click(), 200); window.history.replaceState({}, "", "/files"); } }, []);
  async function upload(file) {
    if (!file) return; setErr("");
    if (file.size > maxMb * 1048576) { setErr(`“${file.name}” is ${size(file.size)}. The free-tier limit is ${maxMb} MB per file.`); return; }
    setBusy(true); setLast(file);
    try { const fd = new FormData(); fd.append("file", file); fd.append("tags", tags); fd.append("project_id", project);
      const r = await fetch("/api/files", { method: "POST", body: fd }); const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Upload failed"); toast("File uploaded"); setTags(""); router.refresh();
    } catch (e) { setErr(e.message === "Failed to fetch" ? "Network problem — check your connection and retry." : e.message); }
    setBusy(false); if (input.current) input.current.value = "";
  }
  const list = files.filter((f) => !q || (f.name + (f.tags || []).join(" ")).toLowerCase().includes(q.toLowerCase()));
  return (<>
    <PageHead title="Files" sub={`Stored in your PostgreSQL database · ${maxMb} MB per file on the free tier.`} />
    <div className="card mb-4">
      <div className="form-grid two">
        <div className="field"><span className="label">Tags (optional)</span><input className="input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="resume, uni" /></div>
        <div className="field"><span className="label">Project (optional)</span><ProjectSelect projects={projects} value={project} onChange={(e) => setProject(e.target.value)} /></div></div>
      <div className="mt-3 flex gap-2 items-center flex-wrap"><input ref={input} type="file" className="sr-only" id="file-in" onChange={(e) => upload(e.target.files?.[0])} />
        <label htmlFor="file-in" className={`btn btn-primary ${busy ? "opacity-50" : ""}`} style={{ cursor: "pointer" }}><Upload size={16} /> {busy ? "Uploading…" : "Choose file"}</label>
        <span className="small muted">or drop a file anywhere on this card</span></div>
      {err && <div className="mt-3"><ErrorBox onRetry={last ? () => upload(last) : undefined}>{err}</ErrorBox></div>}
    </div>
    <input className="input mb-3" style={{ maxWidth: 260 }} placeholder="Search files…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search files" />
    <div className="card" style={{ padding: 8 }}>{list.length === 0 ? <Empty title="No files" hint="Upload your first file above." /> : list.map((f) => (
      <div key={f.id} className="list-row"><FileText size={18} className="muted" /><div className="grow" style={{ minWidth: 0 }}><div className="trunc">{f.name}</div><div className="small muted">{size(f.size_bytes)} · {fmtDate(f.created_at, { day: "numeric", month: "short", year: "numeric" })}{f.project_name ? ` · ${f.project_name}` : ""}</div></div>
        <span className="hidden sm:block"><Tags tags={f.tags?.slice(0, 2)} /></span>
        <a className="btn btn-ghost btn-icon btn-sm" href={`/api/files/${f.id}`} download aria-label={`Download ${f.name}`}><Download size={15} /></a>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => confirm(`Delete ${f.name}?`) && run(() => deleteFile(f.id), { ok: "File deleted" })} aria-label={`Delete ${f.name}`}><Trash2 size={15} /></button></div>))}</div>
  </>);
}
