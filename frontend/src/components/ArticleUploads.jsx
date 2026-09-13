import { useEffect, useId, useRef, useState } from "react";
import { mediaUrl } from "../api";
import Icon from "./Icon";

const imageTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const isImage = (file) => imageTypes.includes(file.type) || (!file.type && /\.(jpe?g|png|webp|gif)$/i.test(file.name));
const fileSize = (size) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

function Dropzone({ purpose, disabled, onFiles, hasBanner }) {
  const input = useRef(null);
  const depth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const hintId = useId();
  const banner = purpose === "banner";
  return <div className={`upload-dropzone ${dragging && !disabled ? "is-dragging" : ""} ${disabled ? "is-disabled" : ""}`}
    onDragEnter={(event) => { event.preventDefault(); depth.current += 1; setDragging(true); }}
    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = disabled ? "none" : "copy"; }}
    onDragLeave={(event) => { event.preventDefault(); depth.current -= 1; if (depth.current <= 0) setDragging(false); }}
    onDrop={(event) => {
      event.preventDefault(); depth.current = 0; setDragging(false);
      if (!disabled) onFiles(Array.from(event.dataTransfer.files), purpose);
    }}>
    <span className="upload-dropzone__icon"><Icon name={banner ? "photo" : "upload"} size={25} /></span>
    <strong>{banner ? hasBanner ? "Drop a new banner to replace it" : "Give your article a cover" : "Add something worth sharing"}</strong>
    <p>{banner ? "Drag an image here, or choose one below." : "Drop photos, documents, or other files here."}</p>
    <button type="button" className="upload-browse" disabled={disabled} aria-describedby={hintId} onClick={() => input.current.click()}>
      <Icon name="plus" size={16} /> {banner ? hasBanner ? "Replace banner" : "Choose banner" : "Browse files"}
    </button>
    <small id={hintId}>{banner ? "JPG, PNG, WebP or GIF · Up to 8 MB" : "Up to 10 files · 20 MB each"}</small>
    <input ref={input} className="upload-input" type="file" tabIndex={-1}
      aria-label={banner ? "Banner image" : "Additional photos & files"}
      accept={banner ? "image/jpeg,image/png,image/webp,image/gif" : undefined}
      multiple={!banner} disabled={disabled} onChange={(event) => {
        onFiles(Array.from(event.target.files), purpose);
        event.target.value = "";
      }} />
  </div>;
}

export default function ArticleUploads({ banner, attachments, busy, title, subtitle, onUpload, onPendingChange, onRemoveBanner, onRemoveAttachment, onMoveAttachment }) {
  const [tasks, setTasks] = useState([]);
  const [messages, setMessages] = useState([]);
  const queue = useRef([]);
  const running = useRef(false);
  const mounted = useRef(true);
  const previews = useRef(new Set());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      queue.current.forEach((task) => task.controller?.abort());
      previews.current.forEach((url) => URL.revokeObjectURL(url));
      previews.current.clear();
      onPendingChange(false);
    };
  }, [onPendingChange]);

  function updateQueue(next) {
    queue.current = next;
    if (mounted.current) { setTasks(next); onPendingChange(next.length > 0); }
  }

  function forget(id) {
    const task = queue.current.find((item) => item.id === id);
    if (task?.preview) { URL.revokeObjectURL(task.preview); previews.current.delete(task.preview); }
    updateQueue(queue.current.filter((item) => item.id !== id));
  }

  function change(id, values) {
    updateQueue(queue.current.map((task) => task.id === id ? { ...task, ...values } : task));
  }

  async function processQueue() {
    if (running.current) return;
    running.current = true;
    try {
      let task;
      while (mounted.current && (task = queue.current.find((item) => item.status === "queued"))) {
        const controller = new AbortController();
        const id = task.id;
        change(id, { status: "uploading", controller, progress: 0 });
        try {
          await onUpload(task.file, task.purpose, {
            signal: controller.signal,
            onProgress: (progress) => { if (mounted.current) change(id, { progress }); },
          });
          if (mounted.current) forget(id);
        } catch (error) {
          if (mounted.current && error.name !== "AbortError") change(id, { status: "error", error: error.message });
        }
      }
    } finally {
      running.current = false;
    }
  }

  function addFiles(files, purpose) {
    if (busy || !files.length) return;
    const errors = [];
    if (purpose === "banner" && (files.length > 1 || queue.current.some((task) => task.purpose === "banner"))) {
      setMessages(["Choose one banner at a time. Finish or remove the current banner upload first."]);
      return;
    }
    const additions = [];
    const existing = [...attachments, ...queue.current.filter((task) => task.purpose === "attachment").map((task) => task.file)];
    for (const file of files) {
      const limit = (purpose === "banner" ? 8 : 20) * 1024 * 1024;
      if (!file.size) { errors.push(`${file.name}: this file is empty.`); continue; }
      if (file.size > limit) { errors.push(`${file.name}: exceeds the ${purpose === "banner" ? 8 : 20} MB limit.`); continue; }
      if (purpose === "banner" && !isImage(file)) { errors.push(`${file.name}: choose a JPG, PNG, WebP, or GIF image.`); continue; }
      if (purpose === "attachment" && existing.some((item) => item.name === file.name && item.size === file.size)) {
        errors.push(`${file.name}: already added.`); continue;
      }
      if (purpose === "attachment" && existing.length >= 10) { errors.push(`${file.name}: all 10 attachment slots are filled.`); continue; }
      const preview = isImage(file) ? URL.createObjectURL(file) : null;
      if (preview) previews.current.add(preview);
      additions.push({ id: crypto.randomUUID(), file, purpose, preview, status: "queued", progress: 0 });
      if (purpose === "attachment") existing.push(file);
    }
    setMessages(errors);
    if (additions.length) {
      updateQueue([...queue.current, ...additions]);
      processQueue();
    }
  }

  function cancel(task) { task.controller?.abort(); forget(task.id); }
  const bannerTask = tasks.find((task) => task.purpose === "banner");
  const heroImage = bannerTask?.preview ?? (banner ? mediaUrl(banner) : null);
  const attachmentCount = attachments.length + tasks.filter((task) => task.purpose === "attachment").length;

  return <fieldset className="article-uploads" disabled={busy}>
    <legend>Photos & files</legend>
    <div className="upload-section">
      <div className="upload-section__heading"><div><h3>Banner image</h3><p>Your journal thumbnail and article cover.</p></div><span className="upload-label">Optional</span></div>
      {heroImage && <div className="upload-hero-preview">
        <img src={heroImage} alt="Banner preview" />
        <div><span>{bannerTask ? "Preview · Upload pending" : "Hero preview"}</span><strong>{title || "Your article title"}</strong><p>{subtitle || "Your subtitle appears here, over the cover image."}</p></div>
      </div>}
      {banner && <div className="upload-saved-banner"><span><Icon name="check" size={15} /> {banner.name} <small>{fileSize(banner.size)}</small></span>
        <button type="button" className="text-button" disabled={Boolean(bannerTask)} onClick={onRemoveBanner}>Remove banner</button></div>}
      <Dropzone purpose="banner" hasBanner={Boolean(banner)} disabled={busy || Boolean(bannerTask)} onFiles={addFiles} />
      <small className="upload-tip">Wide images work best. The cover is cropped to fill the hero and thumbnail.</small>
    </div>

    <div className="upload-section">
      <div className="upload-section__heading"><div><h3>Additional photos & files</h3><p>Shown below your article, in this order.</p></div><span className="upload-label">{attachmentCount}/10</span></div>
      <Dropzone purpose="attachment" disabled={busy || attachmentCount >= 10} onFiles={addFiles} />
      {attachments.length > 0 && <ul className="upload-list">
        {attachments.map((file, index) => <li key={file.url}>
          <span className="upload-file-icon">{file.media_type.startsWith("image/") ? <img src={mediaUrl(file)} alt="" /> : <Icon name="file" size={24} />}</span>
          <div className="upload-file-info"><strong>{file.name}</strong><small>{fileSize(file.size)} · <span className="upload-ready">Ready</span></small></div>
          <div className="upload-file-actions">
            <button type="button" className="upload-icon-button" disabled={index === 0} aria-label={`Move ${file.name} up`} title="Move up" onClick={() => onMoveAttachment(file.url, -1)}><Icon name="up" size={17} /></button>
            <button type="button" className="upload-icon-button" disabled={index === attachments.length - 1} aria-label={`Move ${file.name} down`} title="Move down" onClick={() => onMoveAttachment(file.url, 1)}><Icon name="down" size={17} /></button>
            <button type="button" className="upload-icon-button" aria-label={`Remove ${file.name}`} title="Remove file" onClick={() => onRemoveAttachment(file.url)}><Icon name="close" size={17} /></button>
          </div>
        </li>)}
      </ul>}
    </div>

    {messages.length > 0 && <div className="upload-feedback" role="alert"><strong>Some files could not be added</strong><ul>{messages.map((message, index) => <li key={index}>{message}</li>)}</ul><button type="button" className="text-button" onClick={() => setMessages([])}>Dismiss</button></div>}
    {tasks.length > 0 && <div className="upload-queue">
      <h3>Upload queue</h3>
      <ul className="upload-list">{tasks.map((task) => <li key={task.id} className={task.status === "error" ? "has-error" : ""}>
        <span className="upload-file-icon">{task.preview ? <img src={task.preview} alt="" /> : <Icon name="file" size={24} />}</span>
        <div className="upload-file-info"><strong>{task.file.name}</strong><small>{fileSize(task.file.size)} · {task.purpose === "banner" ? "Banner" : "Attachment"}</small>
          {task.status === "error" ? <p role="alert">{task.error}</p> : <>
            <small>{task.status === "queued" ? "Waiting to upload" : task.progress === 100 ? "Processing file…" : `Uploading ${task.progress}%`}</small>
            <progress max="100" value={task.progress} aria-label={`Uploading ${task.file.name}`} />
          </>}
        </div>
        <div className="upload-file-actions">
          {task.status === "error" && <button type="button" className="text-button" aria-label={`Retry ${task.file.name}`} onClick={() => { change(task.id, { status: "queued", error: "" }); processQueue(); }}>Retry</button>}
          <button type="button" className="upload-icon-button" aria-label={`${task.status === "error" ? "Remove" : "Cancel"} upload ${task.file.name}`} onClick={() => cancel(task)}><Icon name="close" size={18} /></button>
        </div>
      </li>)}</ul>
      <p className="upload-tip" role="status">{tasks.some((task) => task.status === "error") ? "Retry or remove failed uploads before publishing." : "You can keep writing while your files upload."}</p>
    </div>}
  </fieldset>;
}

export function ArticleAttachments({ attachments = [] }) {
  if (!attachments.length) return null;
  return <aside className="article-attachments" aria-label="Additional photos and files">
    <h2>Photos & files</h2>
    {attachments.map((file) => file.media_type.startsWith("image/") ? (
      <figure key={file.url}>
        <a href={mediaUrl(file)} target="_blank" rel="noreferrer"><img src={mediaUrl(file)} alt={file.name} loading="lazy" /></a>
        <figcaption>{file.name}</figcaption>
      </figure>
    ) : (
      <a className="article-file" key={file.url} href={mediaUrl(file)} download={file.name}>
        <span>{file.name}</span><small>Download · {Math.ceil(file.size / 1024)} KB</small>
      </a>
    ))}
  </aside>;
}
