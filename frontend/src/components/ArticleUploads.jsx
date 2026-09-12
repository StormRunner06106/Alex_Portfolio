import { mediaUrl } from "../api";

export default function ArticleUploads({ banner, attachments, busy, onUpload, onRemoveBanner, onRemoveAttachment }) {
  return (
    <fieldset className="article-uploads" disabled={busy}>
      <legend>Photos & files</legend>
      <label className="publisher-field">
        <span>Banner image</span>
        <small>Shown on the journal thumbnail and above the article title. JPEG, PNG, WebP or GIF, up to 8 MB.</small>
        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => {
          onUpload(Array.from(event.target.files), "banner");
          event.target.value = "";
        }} />
      </label>
      {banner && <div className="upload-preview">
        <img src={mediaUrl(banner)} alt="Banner preview" />
        <span>{banner.name}</span>
        <button type="button" className="text-button" onClick={onRemoveBanner}>Remove banner</button>
      </div>}
      <label className="publisher-field">
        <span>Additional photos & files</span>
        <small>Displayed below the article text, in upload order. Up to 10 files, 20 MB each.</small>
        <input type="file" multiple onChange={(event) => {
          onUpload(Array.from(event.target.files), "attachment");
          event.target.value = "";
        }} />
      </label>
      {attachments.length > 0 && <ul className="upload-list">
        {attachments.map((file) => <li key={file.url}>
          {file.media_type.startsWith("image/") && <img src={mediaUrl(file)} alt="" />}
          <span>{file.name} <small>({Math.ceil(file.size / 1024)} KB)</small></span>
          <button type="button" className="text-button" aria-label={`Remove ${file.name}`} onClick={() => onRemoveAttachment(file.url)}>Remove</button>
        </li>)}
      </ul>}
      {busy && <p role="status">Uploading…</p>}
    </fieldset>
  );
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
