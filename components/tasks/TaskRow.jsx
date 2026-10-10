"use client";
import { useState } from "react";
import { toggleTask } from "@/actions/tasks";
import { useAction } from "@/components/ui/useAction";
import { relDay } from "@/lib/dates";
import { Repeat } from "lucide-react";

export default function TaskRow({ task, today, onOpen, compact = false, handle = null }) {
  const { run } = useAction();
  const [done, setDone] = useState(task.completed);
  const overdue = !done && task.due_date && task.due_date < today;
  async function toggle() { const next = !done; setDone(next); const r = await run(() => toggleTask(task.id)); if (!r) setDone(!next); }
  return (
    <div className="list-row">
      {handle}
      <input type="checkbox" className="check" checked={done} onChange={toggle} aria-label={`Complete ${task.title}`} />
      <button className={`grow text-left trunc ${done ? "done" : ""}`} style={{ background: "none", border: 0, color: "inherit", font: "inherit", cursor: onOpen ? "pointer" : "default", padding: 0 }} onClick={() => onOpen?.(task)}>
        {task.title}
        {!compact && task.project_name && <span className="chip ml-2">{task.project_name}</span>}
      </button>
      {task.recurrence && task.recurrence !== "none" && <Repeat size={13} className="muted" aria-label={`Repeats ${task.recurrence}`} />}
      {task.priority === "high" && !done && <span className="pri-high small" title="High priority">●</span>}
      {task.due_date && <span className={`small ${overdue ? "pri-high" : "muted"}`} style={{ whiteSpace: "nowrap" }}>{relDay(task.due_date, today)}</span>}
    </div>
  );
}
