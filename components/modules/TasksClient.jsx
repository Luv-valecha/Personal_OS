"use client";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import PageHead from "@/components/ui/PageHead";
import Modal from "@/components/ui/Modal";
import TaskRow from "@/components/tasks/TaskRow";
import { Field, PrioritySelect, ProjectSelect, Segmented, tagsToString } from "@/components/ui/Fields";
import { Empty, Tags } from "@/components/ui/misc";
import { useAction } from "@/components/ui/useAction";
import { quickAddTask, updateTask, deleteTask, addSubtask, toggleSubtask, deleteSubtask } from "@/actions/tasks";
import { addDays } from "@/lib/dates";

const VIEWS = [{ value: "today", label: "Today" }, { value: "upcoming", label: "Upcoming" }, { value: "overdue", label: "Overdue" }, { value: "completed", label: "Completed" }, { value: "projects", label: "Projects" }];

export default function TasksClient({ tasks, projects, today, initialQuery }) {
  const { run, pending } = useAction();
  const [view, setView] = useState("today"); const [text, setText] = useState(""); const [q, setQ] = useState(initialQuery); const [edit, setEdit] = useState(null); const [limit, setLimit] = useState(50);
  const counts = useMemo(() => ({
    today: tasks.filter((t) => !t.completed && t.due_date === today).length,
    overdue: tasks.filter((t) => !t.completed && t.due_date && t.due_date < today).length,
  }), [tasks, today]);
  const list = useMemo(() => {
    let l = tasks;
    if (q) l = l.filter((t) => (t.title + " " + t.notes + " " + (t.tags || []).join(" ")).toLowerCase().includes(q.toLowerCase()));
    if (view === "today") l = l.filter((t) => !t.completed && (t.due_date === today || (t.due_date && t.due_date < today)));
    if (view === "upcoming") l = l.filter((t) => !t.completed && (!t.due_date || t.due_date > today)).sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
    if (view === "overdue") l = l.filter((t) => !t.completed && t.due_date && t.due_date < today);
    if (view === "completed") l = l.filter((t) => t.completed).sort((a, b) => String(b.completed_at).localeCompare(String(a.completed_at)));
    if (view === "projects") l = l.filter((t) => !t.completed);
    return l;
  }, [tasks, view, q, today]);
  const grouped = useMemo(() => { if (view !== "projects") return null; const g = {}; for (const t of list) (g[t.project_name || "No project"] ||= []).push(t); return Object.entries(g); }, [list, view]);

  async function add(e) { e.preventDefault(); if (!text.trim()) return; const r = await run(() => quickAddTask(text), { ok: "Task added" }); if (r) setText(""); }
  const row = (t) => <TaskRow key={t.id} task={t} today={today} onOpen={setEdit} />;
  return (<>
    <PageHead title="Tasks" sub="Type naturally — “Finish ML report tomorrow !high #uni @HisaabKitaab”" />
    <form onSubmit={add} className="flex gap-2 mb-4">
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a task… (try: Call mom tomorrow)" aria-label="New task" />
      <button className="btn btn-primary" disabled={pending}><Plus size={16} /> Add</button>
    </form>
    <div className="flex flex-wrap items-center gap-3 mb-3">
      <Segmented value={view} onChange={(v) => { setView(v); setLimit(50); }} options={VIEWS.map((v) => ({ ...v, label: v.label + (v.value === "today" && counts.today ? ` ${counts.today}` : "") + (v.value === "overdue" && counts.overdue ? ` ${counts.overdue}` : "") }))} label="Task view" />
      <input className="input" style={{ maxWidth: 220 }} placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter tasks" />
    </div>
    <div className="card" style={{ padding: 8 }}>
      {list.length === 0 ? <Empty title={view === "completed" ? "Nothing completed yet" : view === "overdue" ? "No overdue tasks" : "All clear"} hint={q ? "No tasks match your filter." : "Add a task above to get started."} /> :
        grouped ? grouped.map(([name, items]) => <div key={name} className="mb-2"><div className="card-title" style={{ padding: "8px 4px 0", marginBottom: 4 }}>{name}<span>{items.length}</span></div>{items.map(row)}</div>) :
          <>{list.slice(0, limit).map(row)}{list.length > limit && <div className="text-center py-2"><button className="btn btn-sm" onClick={() => setLimit((n) => n + 50)}>Show more ({list.length - limit})</button></div>}</>}
    </div>
    {edit && <TaskEditor key={edit.id} task={tasks.find((t) => t.id === edit.id) || edit} projects={projects} onClose={() => setEdit(null)} today={today} />}
  </>);
}

function TaskEditor({ task, projects, onClose, today }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ title: task.title, notes: task.notes, due_date: task.due_date || "", priority: task.priority, project_id: task.project_id || "", tags: tagsToString(task.tags), recurrence: task.recurrence });
  const [sub, setSub] = useState(""); const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  async function save(e) { e.preventDefault(); const r = await run(() => updateTask(task.id, { ...f, due_date: f.due_date || null, project_id: f.project_id || null }), { ok: "Task updated" }); if (r) onClose(); }
  async function del() { if (!confirm("Delete this task?")) return; if (await run(() => deleteTask(task.id), { ok: "Task deleted" })) onClose(); }
  return (
    <Modal open onClose={onClose} title="Edit task" wide>
      <form onSubmit={save} className="flex flex-col gap-3">
        <Field label="Title"><input className="input" value={f.title} onChange={set("title")} required /></Field>
        <Field label="Notes"><textarea className="textarea" value={f.notes} onChange={set("notes")} style={{ minHeight: 70 }} /></Field>
        <div className="form-grid two">
          <Field label="Due date"><div className="flex gap-1"><input type="date" className="input" value={f.due_date} onChange={set("due_date")} />
            <button type="button" className="btn btn-sm" onClick={() => setF((s) => ({ ...s, due_date: today }))}>Today</button><button type="button" className="btn btn-sm" onClick={() => setF((s) => ({ ...s, due_date: addDays(today, 1) }))}>Tmrw</button></div></Field>
          <Field label="Priority"><PrioritySelect value={f.priority} onChange={set("priority")} /></Field>
          <Field label="Project"><ProjectSelect projects={projects} value={f.project_id} onChange={set("project_id")} /></Field>
          <Field label="Repeats"><select className="select" value={f.recurrence} onChange={set("recurrence")}><option value="none">Never</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></Field>
        </div>
        <Field label="Tags (comma separated)"><input className="input" value={f.tags} onChange={set("tags")} /></Field>
        <div>
          <span className="label">Subtasks</span>
          {task.subtasks?.map((s) => <div key={s.id} className="list-row"><input type="checkbox" className="check" checked={s.completed} onChange={() => run(() => toggleSubtask(s.id))} aria-label={s.title} /><span className={`grow ${s.completed ? "done" : ""}`}>{s.title}</span><button type="button" className="btn btn-ghost btn-icon btn-sm" onClick={() => run(() => deleteSubtask(s.id))} aria-label="Delete subtask"><Trash2 size={14} /></button></div>)}
          <div className="flex gap-2 mt-2"><input className="input" value={sub} onChange={(e) => setSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (sub.trim()) run(() => addSubtask(task.id, sub)).then((r) => r && setSub("")); } }} placeholder="Add a subtask" aria-label="New subtask" />
            <button type="button" className="btn" onClick={() => sub.trim() && run(() => addSubtask(task.id, sub)).then((r) => r && setSub(""))}>Add</button></div>
        </div>
        {task.tags?.length > 0 && <Tags tags={task.tags} />}
        <div className="flex justify-between gap-2 pt-1"><button type="button" className="btn btn-danger" onClick={del}><Trash2 size={15} /> Delete</button>
          <div className="flex gap-2"><button type="button" className="btn" onClick={onClose}>Close</button><button className="btn btn-primary" disabled={pending}>Save</button></div></div>
      </form>
    </Modal>
  );
}
