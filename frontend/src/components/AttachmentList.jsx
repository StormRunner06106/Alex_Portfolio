import { useState } from "react";
import { DndContext, KeyboardSensor, MouseSensor, TouchSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { mediaUrl } from "../api";
import Icon from "./Icon";

const verticalDrag = ({ transform }) => ({ ...transform, x: 0 });

function SortableAttachment({ file, busy, canSort, sorting, onRemove, formatSize }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: file.url, disabled: !canSort, transition: { duration: 180, easing: "ease" },
  });
  return <li ref={setNodeRef} className={`upload-sortable ${isDragging ? "is-sorting" : ""} ${!canSort ? "is-disabled" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition }}
    onDragStart={(event) => event.preventDefault()}
    onMouseDown={(event) => {
      // Keep touch scrolling available on the row, with dragging on the handle.
      if (!event.target.closest("button")) listeners?.onMouseDown?.(event);
    }}>
    <button ref={setActivatorNodeRef} type="button" className="upload-drag-handle"
      {...attributes} {...listeners} disabled={!canSort} aria-label={`Reorder ${file.name}`}
      title="Drag to reorder. Or press Space, use arrow keys, then Space to drop.">
      <Icon name="grip" size={18} />
    </button>
    <span className="upload-file-icon">{file.media_type.startsWith("image/") ? <img src={mediaUrl(file)} alt="" draggable={false} /> : <Icon name="file" size={24} />}</span>
    <div className="upload-file-info"><strong>{file.name}</strong><small>{formatSize(file.size)} · <span className="upload-ready">Ready</span></small></div>
    <button type="button" className="upload-icon-button" disabled={busy || sorting}
      aria-label={`Remove ${file.name}`} title="Remove file" onClick={() => onRemove(file.url)}><Icon name="close" size={17} /></button>
  </li>;
}

export default function AttachmentList({ attachments, busy, onMove, onRemove, formatSize }) {
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, scrollBehavior: "auto" }),
  );
  const describe = (id) => attachments.find((file) => file.url === id)?.name ?? "File";
  const position = (id) => attachments.findIndex((file) => file.url === id) + 1;
  return <>
    {attachments.length > 1 && <p className="upload-tip upload-sort-hint">Drag to reorder. Keyboard: <kbd>Space</kbd> to pick up, <kbd>↑</kbd>/<kbd>↓</kbd> to move, <kbd>Space</kbd> to drop.</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} modifiers={[verticalDrag]}
      accessibility={{
        screenReaderInstructions: { draggable: "Press Space to pick up a file, arrow keys to move it, and Space to drop. Press Escape to cancel." },
        announcements: {
          onDragStart: ({ active }) => `Picked up ${describe(active.id)}, position ${position(active.id)} of ${attachments.length}.`,
          onDragOver: ({ active, over }) => over ? `${describe(active.id)}, position ${position(over.id)} of ${attachments.length}.` : undefined,
          onDragEnd: ({ active, over }) => over ? `Dropped ${describe(active.id)} at position ${position(over.id)} of ${attachments.length}.` : "Reordering canceled.",
          onDragCancel: () => "Reordering canceled. File order unchanged.",
        },
      }}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragCancel={() => setActiveId(null)}
      onDragEnd={({ active, over }) => {
        setActiveId(null);
        if (!busy && over && active.id !== over.id) onMove(active.id, over.id);
      }}>
      <SortableContext items={attachments.map((file) => file.url)} strategy={verticalListSortingStrategy}>
        <ul className="upload-list upload-sortable-list" aria-label="Attachment order">
          {attachments.map((file) => <SortableAttachment key={file.url} file={file} formatSize={formatSize}
            busy={busy} canSort={!busy && attachments.length > 1} sorting={activeId !== null} onRemove={onRemove} />)}
        </ul>
      </SortableContext>
    </DndContext>
  </>;
}
