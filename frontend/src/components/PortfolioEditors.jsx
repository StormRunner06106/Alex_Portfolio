import { useState } from "react";
import { createExperience, updateExperience, createSkillCategory, updateSkillCategory, updateSkillsOverview } from "../api";
import { useAdmin } from "./AdminSession";
import Icon from "./Icon";
import Modal from "./Modal";

const lines = (text) => text.split("\n").map((line) => line.trim()).filter(Boolean);

function EditorDialog({ title, children, onClose, onSave, onSaved, submitLabel = "Save changes", destructive = false }) {
  const { token, isAdmin, openSignIn } = useAdmin();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy || !isAdmin) return;
    setBusy(true); setError("");
    try { const result = await onSave(token); onSaved(result); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <Modal title={title} busy={busy} onClose={onClose}>
    <form className="portfolio-editor" onSubmit={submit}>
      <fieldset disabled={busy || !isAdmin}>{children}</fieldset>
      {error && <p className="form-status form-status--error" role="alert">{error}</p>}
      {!isAdmin && <p className="form-status" role="status">Sign in again to save. Your edits are still here.</p>}
      <div className="dialog-actions">
        <button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button>
        {isAdmin ? <button type="submit" className={`button ${destructive ? "button--danger" : "button--primary"}`} disabled={busy}>{busy ? "Saving…" : submitLabel}</button>
          : <button type="button" className="button button--primary" onClick={openSignIn}>Sign in</button>}
      </div>
    </form>
  </Modal>;
}

export function ContentActions({ label, onEdit, onDelete }) {
  return <div className="portfolio-item-actions">
    <button type="button" className="text-button" aria-label={`Edit ${label}`} onClick={onEdit}><Icon name="edit" size={15} /> Edit</button>
    <button type="button" className="text-button text-button--danger" aria-label={`Delete ${label}`} onClick={onDelete}><Icon name="trash" size={15} /> Delete</button>
  </div>;
}

export function DeleteContentDialog({ label, onDelete, onClose, onDeleted }) {
  return <EditorDialog title="Delete this entry?" destructive submitLabel="Delete entry" onClose={onClose} onSave={onDelete} onSaved={onDeleted}>
    <p>“{label}” will be removed from the website. This cannot be undone.</p>
  </EditorDialog>;
}

function TagEditor({ label, items, onChange, limit }) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  function add() {
    const value = text.trim();
    if (!value) return;
    if (items.some((item) => item.toLowerCase() === value.toLowerCase())) { setMessage("Already added."); return; }
    if (items.length >= limit) { setMessage(`You can add up to ${limit} labels.`); return; }
    onChange([...items, value]); setText(""); setMessage("");
  }
  return <div className="portfolio-tags-editor">
    <label className="publisher-field"><span>{label}</span>
      <input value={text} maxLength={100} placeholder="Type a label and press Enter" onChange={(event) => { setText(event.target.value); setMessage(""); }}
        onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); add(); } }} />
    </label>
    <div className="portfolio-tag-list">{items.map((item) => <span key={item}>{item}<button type="button" aria-label={`Remove ${item}`} onClick={() => onChange(items.filter((value) => value !== item))}><Icon name="close" size={13} /></button></span>)}</div>
    <div className="portfolio-tag-help"><small>Press Enter to add. Use × to remove.</small><button type="button" className="text-button" onClick={add}>Add label</button></div>
    {message && <small role="status">{message}</small>}
  </div>;
}

export function ExperienceEditor({ item, onClose, onSaved }) {
  const [value, setValue] = useState(() => ({ company: item?.company ?? "", role: item?.role ?? "", location: item?.location ?? "", start: item?.start ?? "", end: item?.end ?? "", summary: item?.summary ?? "", technologies: item?.technologies ?? [], projects: item?.projects ?? [] }));
  const [current, setCurrent] = useState(!item?.end);
  const [highlights, setHighlights] = useState((item?.highlights ?? []).join("\n"));
  const field = (name) => ({ value: value[name], onChange: (event) => setValue((before) => ({ ...before, [name]: event.target.value })) });
  const projectField = (index, name, text) => setValue((before) => ({ ...before, projects: before.projects.map((project, i) => i === index ? { ...project, [name]: text } : project) }));
  function save(token) {
    if (!current && value.end < value.start) throw new Error("End date must be on or after the start date.");
    const payload = { ...value, end: current ? null : value.end, highlights: lines(highlights) };
    return item ? updateExperience(item.id, payload, token) : createExperience(payload, token);
  }
  return <EditorDialog title={item ? "Edit experience" : "Add experience"} onClose={onClose} onSave={save} onSaved={onSaved} submitLabel={item ? "Save changes" : "Add experience"}>
    <label className="publisher-field"><span>Role</span><input autoFocus required maxLength={200} {...field("role")} /></label>
    <div className="portfolio-form-grid">
      <label className="publisher-field"><span>Company</span><input required maxLength={100} {...field("company")} /></label>
      <label className="publisher-field"><span>Location</span><input required maxLength={200} {...field("location")} /></label>
      <label className="publisher-field"><span>Start date</span><input type="month" required {...field("start")} /></label>
      <label className="publisher-field"><span>End date</span><input type="month" min={value.start || undefined} required={!current} disabled={current} {...field("end")} /></label>
    </div>
    <label className="portfolio-checkbox"><input type="checkbox" checked={current} onChange={(event) => setCurrent(event.target.checked)} /> I currently work here</label>
    <label className="publisher-field"><span>Summary</span><textarea aria-label="Summary" required rows={4} maxLength={4000} {...field("summary")} /></label>
    <label className="publisher-field"><span>Highlights — one per line</span><textarea aria-label="Highlights" rows={5} value={highlights} onChange={(event) => setHighlights(event.target.value)} /></label>
    <TagEditor label="Technologies" items={value.technologies} limit={60} onChange={(technologies) => setValue((before) => ({ ...before, technologies }))} />
    <div className="portfolio-projects">
      <div className="portfolio-section-heading"><strong>Project links</strong><button type="button" className="text-button" disabled={value.projects.length >= 20} onClick={() => setValue((before) => ({ ...before, projects: [...before.projects, { name: "", href: "", period: "" }] }))}><Icon name="plus" size={15} /> Add project</button></div>
      {value.projects.map((project, index) => <div className="portfolio-project" key={index}>
        <label className="publisher-field"><span>Project name</span><input required maxLength={100} value={project.name} onChange={(event) => projectField(index, "name", event.target.value)} /></label>
        <label className="publisher-field"><span>Project URL</span><input required type="url" placeholder="https://" value={project.href} onChange={(event) => projectField(index, "href", event.target.value)} /></label>
        <label className="publisher-field"><span>Project period (optional)</span><input maxLength={100} value={project.period} onChange={(event) => projectField(index, "period", event.target.value)} /></label>
        <button type="button" className="text-button text-button--danger" onClick={() => setValue((before) => ({ ...before, projects: before.projects.filter((_, i) => i !== index) }))}>Remove project</button>
      </div>)}
    </div>
  </EditorDialog>;
}

export function SkillCategoryEditor({ item, onClose, onSaved }) {
  const [value, setValue] = useState({ name: item?.name ?? "", description: item?.description ?? "", accent: item?.accent ?? "mint", items: item?.items ?? [] });
  const field = (name) => ({ value: value[name], onChange: (event) => setValue((before) => ({ ...before, [name]: event.target.value })) });
  return <EditorDialog title={item ? "Edit skill category" : "Add skill category"} onClose={onClose} onSave={(token) => item ? updateSkillCategory(item.id, value, token) : createSkillCategory(value, token)} onSaved={onSaved} submitLabel={item ? "Save changes" : "Add category"}>
    <label className="publisher-field"><span>Category name</span><input autoFocus required maxLength={100} {...field("name")} /></label>
    <label className="publisher-field"><span>Description</span><textarea aria-label="Description" required rows={3} maxLength={1000} {...field("description")} /></label>
    <label className="publisher-field"><span>Card color</span><select {...field("accent")}>{["mint", "blue", "lavender", "peach", "yellow"].map((color) => <option key={color} value={color}>{color[0].toUpperCase() + color.slice(1)}</option>)}</select></label>
    <TagEditor label="Skills" items={value.items} limit={100} onChange={(items) => setValue((before) => ({ ...before, items }))} />
  </EditorDialog>;
}

export function SkillsOverviewEditor({ skills, onClose, onSaved }) {
  const [intro, setIntro] = useState(skills.intro);
  const [principles, setPrinciples] = useState(skills.principles.join("\n"));
  return <EditorDialog title="Edit skills overview" onClose={onClose} onSave={(token) => updateSkillsOverview({ intro, principles: lines(principles) }, token)} onSaved={onSaved}>
    <label className="publisher-field"><span>Introduction</span><textarea aria-label="Introduction" autoFocus required rows={4} maxLength={2000} value={intro} onChange={(event) => setIntro(event.target.value)} /></label>
    <label className="publisher-field"><span>How I work — one principle per line</span><textarea aria-label="How I work" rows={6} value={principles} onChange={(event) => setPrinciples(event.target.value)} /></label>
  </EditorDialog>;
}
