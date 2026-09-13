import { Link, useNavigate, useParams } from "react-router-dom";
import { mediaUrl } from "../api";
import { ArticleAttachments } from "../components/ArticleUploads";
import ArticleAdminActions from "../components/ArticleAdminActions";
import useJournalResource from "../useJournalResource";
import Icon from "../components/Icon";
import { RichTextArticle } from "../components/RichTextEditor";
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
  const navigate = useNavigate();
  const { data: post, loading, error, reload } = useJournalResource(slug);

  if (loading && !post) {
    return <div className="container content-page"><LoadingState label="Opening the note" /></div>;
  }

  if (error && !post) {
    return <div className="container content-page"><ErrorState message={error} onRetry={reload} /></div>;
  }

  if (!post) {
    return <div className="container content-page"><ErrorState message="This journal note could not be opened." /></div>;
  }

  return (
    <article className="article-page">
      {error && <div className="article-container"><ErrorState message={error} onRetry={reload} /></div>}
      <header className={`article-hero article-hero--${post.accent}`}>
        {post.banner && <img className="article-banner" src={mediaUrl(post.banner)} alt="" />}
        <div className="article-hero__shape" aria-hidden="true"><Icon name="spark" size={50} /></div>
        <div className="article-container reveal">
          <Link className="back-link" to="/blog"><Icon name="arrowLeft" size={17} /> Back to journal</Link>
          <ArticleAdminActions post={post} onDeleted={() => navigate("/blog")} />
          <div className="article-tags">
            {post.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
          <h1>{post.title}</h1>
          <p>{post.excerpt}</p>
          <div className="article-byline article-byline--simple">
            <Icon name="calendar" size={16} />
            <span>{formatDate(post.published_at)}</span>
            <span>{post.read_time} min read</span>
          </div>
        </div>
      </header>

      <div className="article-container article-content">
        {Array.isArray(post.content) ? post.content.map((section) => (
          <section key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        )) : <RichTextArticle content={post.content} />}
        <ArticleAttachments attachments={post.attachments} />
        <div className="article-end">
          <Icon name="spark" />
          <p>Thanks for reading.</p>
          <Link to="/contact">Continue the conversation <Icon name="arrow" size={17} /></Link>
        </div>
      </div>
    </article>
  );
}
