import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPost, getAdminSession, loginAdmin } from "../api";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { LoadingState } from "../components/Status";

const TOKEN_KEY = "alex-journal-admin";
const today = new Date().toISOString().slice(0, 10);

const initialPost = {
  title: "",
  excerpt: "",
  published_at: today,
  read_time: 5,
  tags: "AI, Engineering",
  accent: "mint",
  section_heading: "The idea",
  body: "",
};

export default function JournalAdminPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");
  const [checking, setChecking] = useState(Boolean(token));
  const [password, setPassword] = useState("");
  const [post, setPost] = useState(initialPost);
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

  async function publish(event) {
    event.preventDefault();
    const paragraphs = post.body
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .filter(Boolean);
    const payload = {
      title: post.title,
      excerpt: post.excerpt,
      published_at: post.published_at,
      read_time: Number(post.read_time),
      tags: post.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      accent: post.accent,
      content: [{ heading: post.section_heading, paragraphs }],
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

  return (
    <section className="content-page container publisher-page">
      <PageHeader
        eyebrow="Journal studio"
        title="Publish a field note."
        description="A small private writing room for adding new articles to the JSON journal."
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
              <p>Paragraphs are separated by a blank line.</p>
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

          <label className="publisher-field publisher-field--wide">
            <span>Topics</span>
            <input name="tags" onChange={updatePost} placeholder="AI, React, Systems" required value={post.tags} />
            <small>Separate up to six topics with commas.</small>
          </label>

          <label className="publisher-field publisher-field--wide">
            <span>Section heading</span>
            <input minLength="3" name="section_heading" onChange={updatePost} required value={post.section_heading} />
          </label>

          <label className="publisher-field publisher-field--wide">
            <span>Article</span>
            <textarea minLength="40" name="body" onChange={updatePost} placeholder="Write the article here…" required rows="15" value={post.body} />
          </label>

          <div className="publisher-submit">
            <button className="button button--primary" disabled={status.type === "sending"} type="submit">
              <Icon name="plus" size={18} /> {status.type === "sending" ? "Publishing…" : "Publish article"}
            </button>
            {status.message && <p className={`form-status form-status--${status.type}`} role="status">{status.message}</p>}
          </div>
        </form>
      )}
    </section>
  );
}
