import { useAdmin } from "../components/AdminSession";
import usePortfolioResource from "../usePortfolioResource";
import { ContentActions, DeleteContentDialog, ExperienceEditor } from "../components/PortfolioEditors";
import { useMemo, useState } from "react";
import { deleteExperience, getExperience } from "../api";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/Status";

function asDate(value) {
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
}

function monthLabel(value) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(asDate(value));
}

function durationLabel(start, end) {
  const startDate = asDate(start);
  const endDate = end ? asDate(end) : new Date();
  const months = Math.max(
    1,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      endDate.getMonth() -
      startDate.getMonth(),
  );
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const parts = [];
  if (years) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (remainingMonths) parts.push(`${remainingMonths} mo`);
  return parts.join(" ") || "1 mo";
}

function TimelineItem({ item, index, isExpanded, onToggle, actions }) {
  const isCurrent = !item.end;
  const year = item.start.slice(0, 4);

  return (
    <article className={`timeline-item reveal ${isCurrent ? "is-current" : ""}`}>
      <div className="timeline-year" aria-hidden="true">
        <span>{year}</span>
      </div>
      <div className="timeline-marker">
        <span />
      </div>
      <div className="timeline-card">
        {actions}
        <button
          className="timeline-card__header"
          onClick={onToggle}
          type="button"
          aria-expanded={isExpanded}
          aria-controls={`experience-${item.id}`}
        >
          <div>
            <div className="timeline-meta">
              <span>{monthLabel(item.start)} — {item.end ? monthLabel(item.end) : "Present"}</span>
              <span>{durationLabel(item.start, item.end)}</span>
              {isCurrent && <span className="current-label">Current</span>}
            </div>
            <h2>{item.role}</h2>
            <p className="company-line">{item.company} <span>·</span> {item.location}</p>
          </div>
          <span className={`expand-button ${isExpanded ? "is-open" : ""}`}>
            <Icon name="chevron" />
          </span>
        </button>

        <div
          className={`timeline-details ${isExpanded ? "is-open" : ""}`}
          id={`experience-${item.id}`}
        >
          <div className="timeline-details__inner">
            <p className="timeline-summary">{item.summary}</p>

            <ul className="highlight-list">
              {item.highlights.map((highlight) => (
                <li key={highlight}>
                  <span><Icon name="check" size={14} /></span>
                  {highlight}
                </li>
              ))}
            </ul>

            {item.projects && (
              <div className="project-links">
                {item.projects.map((project) => (
                  <a href={project.href} key={project.name} target="_blank" rel="noreferrer">
                    <span>
                      <strong>{project.name}</strong>
                      <small>{project.period}</small>
                    </span>
                    <Icon name="arrowUpRight" size={17} />
                  </a>
                ))}
              </div>
            )}

            <div className="tag-row">
              {item.technologies.map((technology) => (
                <span key={technology}>{technology}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

export default function ExperiencePage() {
  const { isAdmin } = useAdmin();
  const { data, loading, error, reload, setData } = usePortfolioResource(getExperience);
  const experience = data ?? [];
  const [expandedId, setExpandedId] = useState("independent");
  const [editor, setEditor] = useState(null);
  function saved(record) {
    setData((current) => [...current.filter((item) => item.id !== record.id), record].sort((a, b) => b.start.localeCompare(a.start)));
    setExpandedId(record.id);
    setEditor(null);
  }

  const visibleYears = useMemo(() => {
    if (!experience.length) return "Your timeline";
    return `${experience.at(-1).start.slice(0, 4)} — now`;
  }, [experience]);

  return (
    <section className="content-page container">
      <PageHeader
        eyebrow="Experience"
        title="A career built close to the work."
        description="Product engineering, critical operations, and technical leadership—connected by a habit of making complicated systems easier to use."
        aside={
          <div className="heading-stat">
            <strong>{experience.length}</strong>
            <span>career chapters<br />{visibleYears}</span>
          </div>
        }
      />

      {isAdmin && <div className="portfolio-admin-toolbar"><p>Keep your career timeline up to date.</p><button type="button" className="button button--primary" disabled={!data} onClick={() => setEditor({ kind: "edit", item: null })}><Icon name="plus" size={17} /> Add experience</button></div>}
      {loading && !data && <LoadingState label="Mapping the timeline" />}
      {error && <ErrorState message={error} onRetry={reload} retrying={loading} />}

      {data && (
        <div className="timeline">
          {!experience.length && <p className="state-card">No experience entries yet.</p>}
          {experience.map((item, index) => (
            <TimelineItem
              actions={isAdmin && <ContentActions label={`${item.role} at ${item.company}`} onEdit={() => setEditor({ kind: "edit", item })} onDelete={() => setEditor({ kind: "delete", item })} />}
              index={index}
              isExpanded={expandedId === item.id}
              item={item}
              key={item.id}
              onToggle={() => setExpandedId((active) => (active === item.id ? "" : item.id))}
            />
          ))}
        </div>
      )}
      {editor?.kind === "edit" && <ExperienceEditor item={editor.item} onClose={() => setEditor(null)} onSaved={saved} />}
      {editor?.kind === "delete" && <DeleteContentDialog label={`${editor.item.role} at ${editor.item.company}`} onClose={() => setEditor(null)} onDelete={(token) => deleteExperience(editor.item.id, token)} onDeleted={() => { setData((current) => current.filter((item) => item.id !== editor.item.id)); setEditor(null); }} />}
    </section>
  );
}

