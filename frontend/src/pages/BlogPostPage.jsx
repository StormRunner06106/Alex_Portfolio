import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPost } from "../api";
import Icon from "../components/Icon";
import { ErrorState, LoadingState } from "../components/Status";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

export default function BlogPostPage() {
  const { slug } = useParams();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    getPost(slug, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setPost(result);
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [slug]);

  if (loading) {
    return <div className="container content-page"><LoadingState label="Opening the note" /></div>;
  }

  if (error) {
    return <div className="container content-page"><ErrorState message={error} /></div>;
  }

  if (!post) {
    return <div className="container content-page"><ErrorState message="This journal note could not be opened." /></div>;
  }

  return (
    <article className="article-page">
      <header className={`article-hero article-hero--${post.accent}`}>
        <div className="article-hero__shape" aria-hidden="true"><Icon name="spark" size={50} /></div>
        <div className="article-container reveal">
          <Link className="back-link" to="/blog"><Icon name="arrowLeft" size={17} /> Back to journal</Link>
          <div className="article-tags">
            {post.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div className="article-byline">
            <span className="mini-avatar">AH</span>
            <span><strong>Alex Herlan</strong><small>{formatDate(post.published_at)} · {post.read_time} min read</small></span>
          </div>
        </div>
      </header>

      <div className="article-container article-content">
        {post.content.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
        <div className="article-end">
          <Icon name="spark" />
          <p>Thanks for reading.</p>
          <Link to="/contact">Continue the conversation <Icon name="arrow" size={17} /></Link>
        </div>
      </div>
    </article>
  );
}
