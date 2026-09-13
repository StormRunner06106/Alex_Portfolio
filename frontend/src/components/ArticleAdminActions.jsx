import { useState } from "react";
import { Link } from "react-router-dom";
import { deleteArticle } from "../api";
import { useAdmin } from "./AdminSession";
import Icon from "./Icon";
import Modal from "./Modal";

export default function ArticleAdminActions({ post, onDeleted }) {
  const { isAdmin, token } = useAdmin();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!isAdmin) return null;

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await deleteArticle(post.slug, token);
      setConfirming(false);
      onDeleted(post.slug);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  return <div className="article-admin-actions">
    <Link className="text-button" to={`/blog/${post.slug}/edit`}><Icon name="edit" size={16} /> Edit</Link>
    <button className="text-button text-button--danger" type="button" onClick={() => { setError(""); setConfirming(true); }}>
      <Icon name="trash" size={16} /> Delete
    </button>
    {confirming && <Modal title="Delete article?" onClose={() => setConfirming(false)} busy={busy}>
      <p>“{post.title}” and its uploaded files will be deleted. Files used by another article will be kept. This cannot be undone.</p>
      {error && <p className="form-status form-status--error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button autoFocus className="button" type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        <button className="button button--danger" type="button" disabled={busy} onClick={remove}>{busy ? "Deleting…" : "Delete article"}</button>
      </div>
    </Modal>}
  </div>;
}
