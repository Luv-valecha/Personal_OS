"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import { Field, PrioritySelect, ProjectSelect, Segmented } from "@/components/ui/Fields";
import { useAction } from "@/components/ui/useAction";
import { quickAddTask } from "@/actions/tasks";
import { createNote } from "@/actions/notes";
import { createExpense } from "@/actions/expenses";
import { createBookmark } from "@/actions/bookmarks";
import { createProject } from "@/actions/projects";
import { createIdea } from "@/actions/ideas";
import { createTask } from "@/actions/tasks";

export const ADD_TYPES = [
  { value: "task", label: "Task" }, { value: "note", label: "Note" }, { value: "expense", label: "Expense" },
  { value: "bookmark", label: "Bookmark" }, { value: "project", label: "Project" }, { value: "idea", label: "Idea" },
];

export default function QuickAdd({ open, type, onType, onClose, projects, currency }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({});
  useEffect(() => { if (open) setF({}); }, [open, type]);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    let res;
    if (type === "task") res = await run(() => (f.advanced ? createTask({ title: f.title, due_date: f.due_date || null, priority: f.priority || "medium", project_id: f.project_id || null, tags: f.tags || "" }) : quickAddTask(f.title || "")), { ok: "Task added" });
    if (type === "note") res = await run(() => createNote({ title: f.title || "", body: f.body || "" }), { ok: "Note saved" });
    if (type === "expense") res = await run(() => createExpense({ amount: f.amount, category: f.category || "other", description: f.description || "" }), { ok: "Expense added" });
    if (type === "bookmark") res = await run(() => createBookmark({ url: f.url || "", title: f.title || "", category: f.category || "other" }), { ok: "Bookmark saved" });
    if (type === "project") res = await run(() => createProject({ name: f.title || "", description: f.body || "", status: "planned" }), { ok: "Project created" });
    if (type === "idea") res = await run(() => createIdea({ title: f.title || "", description: f.body || "" }), { ok: "Idea captured" });
    if (res) onClose();
  }
  return (
    <Modal open={open} onClose={onClose} title="Quick add">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Segmented value={type} onChange={onType} options={ADD_TYPES} label="What to add" />
        {type === "task" && <>
          <Field label="Task"><input className="input" autoFocus value={f.title || ""} onChange={set("title")} placeholder="Finish ML report tomorrow !high #uni" /></Field>
          {!f.advanced ? <p className="sub">Tip: type a date (today, tomorrow, friday, in 3 days), <code>!high</code>, <code>#tag</code>, <code>@project</code>. <button type="button" className="btn btn-ghost btn-sm" onClick={() => setF((s) => ({ ...s, advanced: true }))}>More options</button></p> :
            <div className="form-grid two">
              <Field label="Due date"><input type="date" className="input" value={f.due_date || ""} onChange={set("due_date")} /></Field>
              <Field label="Priority"><PrioritySelect value={f.priority || "medium"} onChange={set("priority")} /></Field>
              <Field label="Project"><ProjectSelect projects={projects} value={f.project_id || ""} onChange={set("project_id")} /></Field>
              <Field label="Tags (comma separated)"><input className="input" value={f.tags || ""} onChange={set("tags")} /></Field>
            </div>}
        </>}
        {type === "note" && <>
          <Field label="Title"><input className="input" autoFocus value={f.title || ""} onChange={set("title")} placeholder="Untitled" /></Field>
          <Field label="Note (Markdown)"><textarea className="textarea" value={f.body || ""} onChange={set("body")} /></Field></>}
        {type === "expense" && <div className="form-grid two">
          <Field label={`Amount (${currency})`}><input className="input" autoFocus inputMode="decimal" value={f.amount || ""} onChange={set("amount")} placeholder="0" /></Field>
          <Field label="Category"><input className="input" list="cats" value={f.category || ""} onChange={set("category")} placeholder="food" /></Field>
          <Field label="Description" className="sm:col-span-2"><input className="input" value={f.description || ""} onChange={set("description")} /></Field></div>}
        {type === "bookmark" && <>
          <Field label="URL"><input className="input" autoFocus inputMode="url" value={f.url || ""} onChange={set("url")} placeholder="https://" /></Field>
          <Field label="Title (optional — fetched automatically)"><input className="input" value={f.title || ""} onChange={set("title")} /></Field></>}
        {type === "project" && <>
          <Field label="Name"><input className="input" autoFocus value={f.title || ""} onChange={set("title")} /></Field>
          <Field label="Description"><textarea className="textarea" value={f.body || ""} onChange={set("body")} /></Field></>}
        {type === "idea" && <>
          <Field label="Idea"><input className="input" autoFocus value={f.title || ""} onChange={set("title")} /></Field>
          <Field label="Details"><textarea className="textarea" value={f.body || ""} onChange={set("body")} /></Field></>}
        <datalist id="cats">{["food", "transport", "shopping", "bills", "entertainment", "health", "other"].map((c) => <option key={c} value={c} />)}</datalist>
        <div className="flex justify-end gap-2"><button type="button" className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={pending}>{pending ? "Saving…" : "Add"}</button></div>
      </form>
    </Modal>
  );
}
