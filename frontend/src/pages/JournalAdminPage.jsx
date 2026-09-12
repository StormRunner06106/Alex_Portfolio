import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPost, getAdminSession, loginAdmin, uploadMedia } from "../api";
import ArticleUploads from "../components/ArticleUploads";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import RichTextEditor from "../components/RichTextEditor";
import { LoadingState } from "../components/Status";

const TOKEN_KEY = "alex-journal-admin";
const today = new Date().toISOString().slice(0, 10);
const emptyDocument = { type: "doc", content: [{ type: "paragraph" }] };
const suggestedTopics = [
  "AI",
  "React",
  "FastAPI",
  "Supabase",
  "Python",
  "Cloud",
  "DevOps",
  "Product",
  "Reliability",
  "Security",
];

const initialPost = {
  title: "",
  excerpt: "",
  published_at: today,
  read_time: 5,
  tags: ["AI"],
  accent: "mint",
};

export default function JournalAdminPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [checking, setChecking] = useState(Boolean(token));
  const [password, setPassword] = useState("");
  const [post, setPost] = useState(initialPost);
  const [article, setArticle] = useState(emptyDocument);
  const [articleText, setArticleText] = useState("");
  const [banner, setBanner] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [customTopic, setCustomTopic] = useState("");
  const [status, setStatus] = useState({ type: "idle", message: "" });

  useEffect(() => {
    if (!token) {
      setChecking(false);
      return undefined;
    }

    const controller = new AbortController();
    getAdminSession(token, controller.signal)
      .catch((error) => {
        if (error.name !== "AbortError") {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken("");
          setStatus({ type: "error", message: "Your session ended. Sign in again." });
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [token]);

  async function signIn(event) {
    event.preventDefault();
    setStatus({ type: "sending", message: "Signing in…" });
    try {
      const result = await loginAdmin(password);
      sessionStorage.setItem(TOKEN_KEY, result.access_token);
      setToken(result.access_token);
      setPassword("");
      setStatus({ type: "success", message: "Signed in. Your session lasts four hours." });
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    }
  }

  function signOut() {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken("");
    setStatus({ type: "idle", message: "" });
  }

  function updatePost(event) {
    setPost((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function toggleTopic(topic) {
    setPost((current) => {
      if (current.tags.includes(topic)) {
        return { ...current, tags: current.tags.filter((item) => item !== topic) };
      }
      if (current.tags.length >= 6) {
        setStatus({ type: "error", message: "Choose up to six topics." });
        return current;
      }
      return { ...current, tags: [...current.tags, topic] };
    });
  }

  function addCustomTopic() {
    const topic = customTopic.trim();
    if (!topic || post.tags.includes(topic)) return;
    if (post.tags.length >= 6) {
      setStatus({ type: "error", message: "Choose up to six topics." });
      return;
    }
    setPost((current) => ({ ...current, tags: [...current.tags, topic] }));
    setCustomTopic("");
  }

  async function publish(event) {
    event.preventDefault();
    if (uploading || status.type === "sending") return;
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
    };

    setStatus({ type: "sending", message: "Publishing…" });
    try {
      const created = await createPost(payload, token);
      setStatus({ type: "success", message: "Published. Opening the article…" });
      navigate(`/blog/${created.slug}`);
    } catch (error) {
      if (error.status === 401) {
        sessionStorage.removeItem(TOKEN_KEY);
        setToken("");
      }
      setStatus({ type: "error", message: error.message });
    }
  }

  async function uploadFiles(files, purpose) {
    if (!files.length || uploading) return;
    if (purpose === "attachment" && attachments.length + files.length > 10) {
      setStatus({ type: "error", message: "Choose up to 10 additional files." });
      return;
    }
    const limit = (purpose === "banner" ? 8 : 20) * 1024 * 1024;
    if (files.some((file) => !file.size || file.size > limit)) {
      setStatus({ type: "error", message: `Choose non-empty files up to ${limit / 1024 / 1024} MB each.` });
      return;
    }
    setUploading(true);
    setStatus({ type: "idle", message: "" });
    try {
      for (const file of files) {
        const uploaded = await uploadMedia(file, purpose, token);
        if (purpose === "banner") setBanner(uploaded);
        else setAttachments((current) => [...current, uploaded]);
      }
    } catch (error) {
      setStatus({ type: "error", message: error.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="content-page container publisher-page">
      <PageHeader
        eyebrow="Journal studio"
        title="Publish a field note."
        description="A focused writing room with rich-text editing and Supabase-ready storage."
        aside={token ? <span className="publisher-badge"><span /> Authenticated</span> : null}
      />

      {checking && <LoadingState label="Checking your session" />}

      {!checking && !token && (
        <form className="publisher-login reveal" onSubmit={signIn}>
          <span className="publisher-login__icon"><Icon name="lock" size={24} /></span>
          <div>
            <p className="eyebrow">Private access</p>
            <h2>Sign in to write</h2>
            <p>The publisher uses one server-side password. It is never stored in the browser.</p>
          </div>
          <label>
            <span>Admin password</span>
            <input
              autoComplete="current-password"
              autoFocus
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your journal password"
              required
              type="password"
              value={password}
            />
          </label>
          <button className="button button--primary" disabled={status.type === "sending"} type="submit">
            Unlock publisher <Icon name="arrow" size={18} />
          </button>
          {status.message && <p className={`form-status form-status--${status.type}`} role="status">{status.message}</p>}
        </form>
      )}

      {!checking && token && (
        <form className="publisher-form reveal" onSubmit={publish}>
          <div className="publisher-toolbar">
            <div>
              <p className="eyebrow">New article</p>
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
            </div>
            <div className="custom-topic">
              <input
                maxLength="40"
                onChange={(event) => setCustomTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomTopic();
                  }
                }}
                placeholder="Add another topic"
                value={customTopic}
              />
              <button onClick={addCustomTopic} type="button">Add topic</button>
            </div>
          </fieldset>

          <div className="publisher-field publisher-field--wide">
            <span>Article</span>
            <RichTextEditor content={article} onChange={(content, text) => { setArticle(content); setArticleText(text); }} />
            <small>{articleText.length} characters · Use headings to break longer pieces into sections.</small>
          </div>

          <p className="section-help">Use + Section to add a heading and a new section. Each section gets a divider and an automatic uppercase drop cap on its opening paragraph.</p>
          <ArticleUploads banner={banner} attachments={attachments} busy={uploading || status.type === "sending"}
            onUpload={uploadFiles} onRemoveBanner={() => setBanner(null)}
            onRemoveAttachment={(url) => setAttachments((current) => current.filter((file) => file.url !== url))} />

          <div className="publisher-submit">
            <button className="button button--primary" disabled={uploading || status.type === "sending"} type="submit">
              <Icon name="plus" size={18} /> {status.type === "sending" ? "Publishing…" : "Publish article"}
            </button>
            {status.message && <p className={`form-status form-status--${status.type}`} role="status">{status.message}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
