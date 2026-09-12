import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getPosts, mediaUrl } from "../api";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/Status";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function PostCard({ post, featured }) {
  return (
    <article className={`post-card post-card--${post.accent} ${featured ? "post-card--featured" : ""} reveal`}>
      <Link to={`/blog/${post.slug}`} aria-label={`Read ${post.title}`}>
        <div className="post-card__art" aria-hidden="true">
          {post.banner ? <img className="post-card__image" src={mediaUrl(post.banner)} alt="" loading="lazy" /> : <>
          <span className="art-ring" />
          <span className="art-code">{post.tags[0]}</span>
          <Icon name="spark" size={featured ? 34 : 26} />
          </>}
        </div>
        <div className="post-card__body">
          <div className="post-meta">
            <span>{formatDate(post.published_at)}</span>
            <span>{post.read_time} min read</span>
          </div>
          <h2>{post.title}</h2>
          <p>{post.excerpt}</p>
          <div className="post-card__footer">
            <div className="mini-tags">
              {post.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}
            </div>
            <span className="read-arrow"><Icon name="arrowUpRight" size={18} /></span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export default function BlogPage() {
  const [posts, setPosts] = useState([]);
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState("All");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getPosts(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPosts(result);
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const tags = useMemo(() => {
    const counts = new Map();
    posts.flatMap((post) => post.tags).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    return ["All", ...[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([tag]) => tag)];
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesTag = activeTag === "All" || post.tags.includes(activeTag);
      const matchesQuery = !needle || `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase().includes(needle);
      return matchesTag && matchesQuery;
    });
  }, [activeTag, posts, query]);

  return (
    <section className="content-page container">
      <PageHeader
        eyebrow="Journal"
        title="Notes from the build."
        description="Practical observations on applied AI, resilient products, and the technology choices behind them."
        aside={(
          <div className="journal-heading-aside">
            <p className="issue-count">{posts.length || 10}<span>field notes</span></p>
            <Link className="write-link" to="/blog/manage"><Icon name="plus" size={15} /> Write</Link>
          </div>
        )}
      />

      <div className="journal-tools reveal">
        <label className="search-box">
          <span className="sr-only">Search articles</span>
          <Icon name="search" size={18} />
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the journal"
            type="search"
            value={query}
          />
        </label>
        <div className="filter-row" aria-label="Filter articles by topic">
          {tags.map((tag) => (
            <button
              className={activeTag === tag ? "is-active" : ""}
              key={tag}
              onClick={() => setActiveTag(tag)}
              type="button"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {loading && <LoadingState label="Fetching field notes" />}
      {error && <ErrorState message={error} />}

      {!loading && !error && filteredPosts.length > 0 && (
        <div className="posts-grid">
          {filteredPosts.map((post, index) => (
            <PostCard featured={index === 0 && !query && activeTag === "All"} key={post.slug} post={post} />
          ))}
        </div>
      )}

      {!loading && !error && filteredPosts.length === 0 && (
        <div className="empty-card">
          <Icon name="search" />
          <h2>No notes found</h2>
          <p>Try a different phrase or topic.</p>
        </div>
      )}
    </section>
  );
}
