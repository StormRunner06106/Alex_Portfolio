import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { mediaUrl } from "../api";
import { mainTopics, topicKey } from "../topics";
import useJournalResource from "../useJournalResource";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import ArticleAdminActions from "../components/ArticleAdminActions";
import { useAdmin } from "../components/AdminSession";
import { ErrorState, LoadingState } from "../components/Status";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function PostCard({ post, featured, onDeleted }) {
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
      <ArticleAdminActions post={post} onDeleted={onDeleted} />
    </article>
  );
}

export default function BlogPage() {
  const { isAdmin } = useAdmin();
  const { data, setData: setPosts, loading, error, reload } = useJournalResource();
  const posts = data ?? [];
  const [query, setQuery] = useState("");
  const [activeTag, setActiveTag] = useState(null);
  const [showOthers, setShowOthers] = useState(false);
  const tags = [null, ...mainTopics];
  const customTopics = useMemo(() => {
    const mainKeys = new Set(mainTopics.map(topicKey));
    const custom = new Map();
    posts.flatMap((post) => post.tags).forEach((tag) => {
      const key = topicKey(tag);
      if (key && !mainKeys.has(key) && !custom.has(key)) custom.set(key, tag.trim());
    });
    return [...custom.values()].sort((a, b) => a.localeCompare(b));
  }, [posts]);
  const customActive = activeTag !== null && !mainTopics.some((tag) => topicKey(tag) === topicKey(activeTag));

  const filteredPosts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      const matchesTag = activeTag === null || post.tags.some((tag) => topicKey(tag) === topicKey(activeTag));
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
            <p className="issue-count">{posts.length}<span>field notes</span></p>
            {isAdmin && <Link className="write-link" to="/blog/manage"><Icon name="plus" size={15} /> New article</Link>}
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
        <div className="journal-filters">
        <div className="filter-row filter-row--wrap" role="group" aria-label="Filter articles by topic">
          {tags.map((tag) => (
            <button
              className={activeTag === tag ? "is-active" : ""}
              aria-pressed={activeTag === tag}
              key={tag ?? "all-filter"}
              onClick={() => { setActiveTag(tag); setShowOthers(false); }}
              type="button"
            >
              {tag ?? "All"}
            </button>
          ))}
          <button type="button" className={`others-filter ${showOthers || customActive ? "is-active" : ""}`}
            aria-expanded={showOthers} aria-controls="journal-custom-topics" onClick={() => setShowOthers((current) => !current)}>
            Others{customActive && <span> · {activeTag}</span>} <Icon name="chevron" size={14} />
          </button>
        </div>
        <div id="journal-custom-topics" className="custom-topic-filters" hidden={!showOthers}>
          <p>Custom topics <span>{customTopics.length}</span></p>
          {customTopics.length ? <div className="filter-row filter-row--wrap" role="group" aria-label="Filter by custom topic">
            {customTopics.map((tag) => <button key={topicKey(tag)} type="button"
              className={topicKey(activeTag ?? "") === topicKey(tag) ? "is-active" : ""}
              aria-pressed={topicKey(activeTag ?? "") === topicKey(tag)} onClick={() => setActiveTag(tag)}>{tag}</button>)}
          </div> : <small>{loading ? "Loading topics..." : "No custom topics yet."}</small>}
        </div>
        </div>
      </div>

      {loading && !data && <LoadingState label="Fetching field notes" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading && data && <p role="status">Refreshing articles...</p>}

      {filteredPosts.length > 0 && (
        <div className="posts-grid">
          {filteredPosts.map((post, index) => (
            <PostCard featured={index === 0 && !query && activeTag === null} key={post.slug} post={post}
              onDeleted={(slug) => setPosts((current) => current.filter((item) => item.slug !== slug))} />
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
