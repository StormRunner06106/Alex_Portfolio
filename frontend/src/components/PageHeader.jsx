export default function PageHeader({ eyebrow, title, description, aside }) {
  return (
    <header className="page-heading reveal">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {aside && <div className="page-heading__aside">{aside}</div>}
    </header>
  );
}

