import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createPost, getPost, updateArticle, uploadMedia } from "../api";
import ArticleUploads from "../components/ArticleUploads";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import RichTextEditor from "../components/RichTextEditor";
import { ErrorState, LoadingState } from "../components/Status";
import { useAdmin } from "../components/AdminSession";
import { editableDocument, articlePlainText } from "../articleContent";
import { mainTopics as suggestedTopics } from "../topics";

const today = new Date().toISOString().slice(0, 10);
const emptyDocument = { type: "doc", content: [{ type: "paragraph" }] };


const initialPost = {
  title: "",
  excerpt: "",
  published_at: today,
  read_time: 5,
  tags: ["AI"],
  accent: "mint",
};

export default function JournalAdminPage() {
  const { slug } = useParams();
  return <ArticleForm key={slug ?? "new"} slug={slug} />;
}

function ArticleForm({ slug }) {
  const navigate = useNavigate();
  const { token, checking, isAdmin, signOut, openSignIn } = useAdmin();
  const [loading, setLoading] = useState(Boolean(slug));
  const [loadError, setLoadError] = useState("");
  const [post, setPost] = useState(initialPost);
  const [article, setArticle] = useState(emptyDocument);
  const [articleText, setArticleText] = useState("");
  const [banner, setBanner] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const discardedUploads = useRef(new Set());
  const [uploading, setUploading] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [topicMessage, setTopicMessage] = useState("");
  const topicInput = useRef(null);
  const [status, setStatus] = useState({ type: "idle", message: "" });

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    getPost(slug, controller.signal)
      .then((existing) => {
        if (controller.signal.aborted) return;
        const document = editableDocument(existing.content);
        setPost({ title: existing.title, excerpt: existing.excerpt, published_at: existing.published_at,
          read_time: existing.read_time, tags: existing.tags, accent: existing.accent });
        setArticle(document);
        setArticleText(articlePlainText(document));
        setBanner(existing.banner ?? null);
        setAttachments(existing.attachments ?? []);
      })
      .catch((error) => { if (error.name !== "AbortError") setLoadError(error.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug]);

  function updatePost(event) {
    setPost((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function toggleTopic(topic) {
    if (!post.tags.includes(topic) && post.tags.length >= 6) {
      setTopicMessage("You can select up to six topics. Remove one to add another.");
      return;
    }
    setTopicMessage("");
    setPost((current) => ({ ...current, tags: current.tags.includes(topic)
      ? current.tags.filter((item) => item !== topic) : [...current.tags, topic] }));
  }

  function addCustomTopic() {
    const typed = customTopic.trim();
    if (!typed) return;
    const topic = [...suggestedTopics, ...post.tags].find((item) => item.toLowerCase() === typed.toLowerCase()) ?? typed;
    if (post.tags.includes(topic)) {
      setCustomTopic("");
      setTopicMessage(`${topic} is already selected.`);
      topicInput.current?.focus();
      return;
    }
    if (post.tags.length >= 6) {
      setTopicMessage("You can select up to six topics. Remove one to add another.");
      return;
    }
    setPost((current) => ({ ...current, tags: [...current.tags, topic] }));
    setCustomTopic("");
    setTopicMessage(`${topic} added and selected.`);
    topicInput.current?.focus();
  }

  function removeCustomTopic(topic) {
    setPost((current) => ({ ...current, tags: current.tags.filter((item) => item !== topic) }));
    setTopicMessage(`${topic} removed.`);
    topicInput.current?.focus();
  }

  async function publish(event) {
    event.preventDefault();
    if (!isAdmin || uploading || status.type === "sending") return;
    if (!post.tags.length) {
      setStatus({ type: "error", message: "Choose at least one topic." });
      return;
    }
    if (articleText.length < 40) {
      setStatus({ type: "error", message: "Write at least 40 characters before publishing." });
      return;
    }

    const payload = {
      ...post,
      read_time: Number(post.read_time),
      content: article,
      banner,
      attachments,
      discarded_uploads: [...discardedUploads.current],
    };

    setStatus({ type: "sending", message: slug ? "Saving changes..." : "Publishing..." });
    try {
      const created = slug ? await updateArticle(slug, payload, token) : await createPost(payload, token);
      setStatus({ type: "success", message: "Published. Opening the article…" });
      navigate(`/blog/${created.slug}`);
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  async function uploadFile(file, purpose, options) {
    const uploaded = await uploadMedia(file, purpose, token, options);
    if (options.signal.aborted) return;
    if (purpose === "banner") setBanner((previous) => {
      if (previous) discardedUploads.current.add(previous.url);
      return uploaded;
    });
    else setAttachments((current) => [...current, uploaded]);
  }

  function moveAttachment(url, targetUrl) {
    setAttachments((current) => {
      const index = current.findIndex((file) => file.url === url);
      const next = current.findIndex((file) => file.url === targetUrl);
      if (index < 0 || next < 0 || index === next) return current;
      const ordered = [...current];
      ordered.splice(next, 0, ordered.splice(index, 1)[0]);
      return ordered;
    });
  }

  return (
    <section className="content-page container publisher-page">
      <PageHeader
        eyebrow="Journal studio"
        title={slug ? "Edit your field note." : "Publish a field note."}
        description="Write in sections, add photos and files, and share your field notes."
        aside={isAdmin ? <span className="publisher-badge"><span /> Admin</span> : null}
      />

      {checking && <LoadingState label="Checking your session" />}

      {!checking && !isAdmin && (
        <div className="publisher-login">
          <h2>Sign in to manage articles</h2>
          <p>Use your admin password to create or edit a journal article.</p>
          <button className="button button--primary" type="button" onClick={openSignIn}><Icon name="lock" size={18} /> Sign in</button>
        </div>
      )}
      {isAdmin && loading && <LoadingState label="Loading article" />}
      {isAdmin && loadError && <ErrorState message={loadError} />}

      {isAdmin && !loading && !loadError && (
        <form className="publisher-form reveal" onSubmit={publish}>
          <div className="publisher-toolbar">
            <div>
              <p className="eyebrow">{slug ? "Edit article" : "New article"}</p>
              <p>Write, format, choose the topics, and publish from one clean workspace.</p>
            </div>
            <button className="text-button" onClick={signOut} type="button"><Icon name="logout" size={16} /> Sign out</button>
          </div>

          <label className="publisher-field publisher-field--wide">
            <span>Title</span>
            <input minLength="5" name="title" onChange={updatePost} placeholder="A clear, useful title" required value={post.title} />
          </label>

          <label className="publisher-field publisher-field--wide">
            <span>Excerpt</span>
            <textarea maxLength="360" minLength="20" name="excerpt" onChange={updatePost} placeholder="A concise introduction for the journal index." required rows="3" value={post.excerpt} />
          </label>

          <div className="publisher-fields-row">
            <label className="publisher-field">
              <span>Publish date</span>
              <input name="published_at" onChange={updatePost} required type="date" value={post.published_at} />
            </label>
            <label className="publisher-field">
              <span>Reading time</span>
              <input max="60" min="1" name="read_time" onChange={updatePost} required type="number" value={post.read_time} />
            </label>
            <label className="publisher-field">
              <span>Color</span>
              <select name="accent" onChange={updatePost} value={post.accent}>
                <option value="mint">Mint</option>
                <option value="blue">Blue</option>
                <option value="lavender">Lavender</option>
                <option value="peach">Peach</option>
                <option value="yellow">Yellow</option>
              </select>
            </label>
          </div>

          <fieldset className="topic-picker">
            <legend>Topics <span>{post.tags.length}/6 selected</span></legend>
            <div className="topic-options">
              {suggestedTopics.map((topic) => (
                <button
                  aria-pressed={post.tags.includes(topic)}
                  className={post.tags.includes(topic) ? "is-active" : ""}
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  type="button"
                >
                  {post.tags.includes(topic) ? "✓ " : "+ "}{topic}
                </button>
              ))}
              {post.tags.filter((topic) => !suggestedTopics.includes(topic)).map((topic) => (
                <span className="topic-chip is-active" key={topic}>
                  <span><Icon name="check" size={13} /> {topic}</span>
                  <button className="topic-chip__remove" type="button" aria-label={`Remove topic ${topic}`}
                    title={`Remove ${topic}`} onClick={() => removeCustomTopic(topic)}><Icon name="close" size={14} /></button>
                </span>
              ))}
            </div>
            <div className="custom-topic">
              <div className="custom-topic__input">
              <label className="sr-only" htmlFor="custom-topic">Custom topic</label>
              <input
                ref={topicInput}
                id="custom-topic"
                aria-describedby="topic-shortcut topic-feedback"
                aria-keyshortcuts="Enter"
                enterKeyHint="done"
                maxLength="40"
                onChange={(event) => { setCustomTopic(event.target.value); setTopicMessage(""); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    addCustomTopic();
                  }
                }}
                placeholder="Add another topic"
                value={customTopic}
              />
              <kbd aria-hidden="true">Enter ↵</kbd>
              </div>
              <button onClick={addCustomTopic} disabled={!customTopic.trim()} type="button">Add topic</button>
            </div>
            <p className="topic-hint" id="topic-shortcut">Type a topic and press <kbd>Enter</kbd> to add and select it. Use × on a custom topic to remove it.</p>
            <p className="topic-feedback" id="topic-feedback" role="status">{topicMessage}</p>
          </fieldset>

          <div className="publisher-field publisher-field--wide">
            <span>Article</span>
            <RichTextEditor content={article} onChange={(content, text) => { setArticle(content); setArticleText(text); }} />
            <small>{articleText.length} characters · Use headings to break longer pieces into sections.</small>
          </div>

          <p className="section-help">Use + Section to add a heading and a new section. Each section gets a divider and an automatic uppercase drop cap on its opening paragraph.</p>
          <ArticleUploads banner={banner} attachments={attachments} busy={status.type === "sending"}
            title={post.title} subtitle={post.excerpt} onPendingChange={setUploading} onMoveAttachment={moveAttachment}
            onUpload={uploadFile} onRemoveBanner={() => {
              if (banner) discardedUploads.current.add(banner.url);
              setBanner(null);
            }}
            onRemoveAttachment={(url) => {
              discardedUploads.current.add(url);
              setAttachments((current) => current.filter((file) => file.url !== url));
            }} />
          <p className="section-help">Removed photos and files are deleted from storage when you {slug ? "save changes" : "publish"}.</p>

          <div className="publisher-submit">
            <Link className="text-button" to={slug ? `/blog/${slug}` : "/blog"}>Cancel</Link>
            <button className="button button--primary" disabled={!isAdmin || uploading || status.type === "sending"} type="submit">
              <Icon name={slug ? "check" : "plus"} size={18} /> {status.type === "sending" ? "Saving..." : slug ? "Save changes" : "Publish article"}
            </button>
            {status.message && <p className={`form-status form-status--${status.type}`} role="status">{status.message}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
