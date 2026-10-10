"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import TaskRow from "@/components/tasks/TaskRow";
import { moveTask } from "@/actions/tasks";
import { useToast } from "@/components/ui/Toast";

function Row({ task, today, onOpen, compact, canDrag }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: !canDrag });
  const handle = canDrag ? (
    <button type="button" className="btn btn-ghost btn-icon btn-sm" style={{ width: 26, minHeight: 28, cursor: "grab", touchAction: "none", flex: "none" }} aria-label={`Reorder ${task.title}. Press space, then arrow keys, then space to drop.`} {...attributes} {...listeners}><GripVertical size={15} /></button>) : null;
  return (<div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, position: "relative", zIndex: isDragging ? 5 : "auto", background: isDragging ? "var(--color-surface-elevated)" : undefined, borderRadius: 8 }}>
    <TaskRow task={task} today={today} onOpen={onOpen} compact={compact} handle={handle} /></div>);
}

// Drag & drop list. `tasks` must already be sorted for display. Dragging is only enabled in manual mode (canDrag),
// so a drag can never create an ambiguous order. Optimistic: reorder locally, persist ONE row, roll back on failure.
export default function SortableTaskList({ tasks, today, canDrag, onOpen, compact = false }) {
  const toast = useToast(); const router = useRouter(); const [items, setItems] = useState(tasks); const queue = useRef(Promise.resolve()); const dragging = useRef(false);
  const sig = tasks.map((t) => t.id + ":" + t.manual_position + ":" + t.completed).join("|");
  useEffect(() => { if (!dragging.current) setItems(tasks); }, [sig]); // eslint-disable-line -- resync when the server data changes
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 120, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  function onEnd({ active, over }) {
    dragging.current = false; if (!over || active.id === over.id) return;
    const from = items.findIndex((t) => t.id === active.id), to = items.findIndex((t) => t.id === over.id); if (from < 0 || to < 0) return;
    const before = items, next = arrayMove(items, from, to); setItems(next);
    const prevId = next[to - 1]?.id || null, nextId = next[to + 1]?.id || null;
    // serialise moves so rapid drags can't race each other
    queue.current = queue.current.then(async () => {
      const r = await moveTask(active.id, prevId, nextId).catch(() => null);
      if (!r?.ok) { setItems(before); toast(r?.error || "Couldn't save the new order", "err"); router.refresh(); }
    });
  }
  if (!canDrag) return items.map((t) => <TaskRow key={t.id} task={t} today={today} onOpen={onOpen} compact={compact} />);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[restrictToVerticalAxis]} onDragStart={() => { dragging.current = true; }} onDragCancel={() => { dragging.current = false; }} onDragEnd={onEnd}
      accessibility={{ announcements: { onDragStart: ({ active }) => `Picked up task ${items.find((t) => t.id === active.id)?.title}`, onDragOver: ({ over }) => (over ? `Over position ${items.findIndex((t) => t.id === over.id) + 1}` : ""), onDragEnd: ({ over }) => (over ? `Dropped at position ${items.findIndex((t) => t.id === over.id) + 1}` : "Dropped"), onDragCancel: () => "Reorder cancelled" } }}>
      <SortableContext items={items.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {items.map((t) => <Row key={t.id} task={t} today={today} onOpen={onOpen} compact={compact} canDrag />)}
      </SortableContext>
    </DndContext>);
}
