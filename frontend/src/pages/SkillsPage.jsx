import { useAdmin } from "../components/AdminSession";
import usePortfolioResource from "../usePortfolioResource";
import { ContentActions, DeleteContentDialog, SkillCategoryEditor, SkillsOverviewEditor } from "../components/PortfolioEditors";
import { useState } from "react";
import { deleteSkillCategory, getSkills } from "../api";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/Status";

export default function SkillsPage() {
  const { isAdmin } = useAdmin();
  const { data: skills, loading, error, reload, setData } = usePortfolioResource(getSkills);
  const [editor, setEditor] = useState(null);
  function savedCategory(record) {
    setData((current) => ({ ...current, categories: current.categories.some((item) => item.id === record.id)
      ? current.categories.map((item) => item.id === record.id ? record : item) : [...current.categories, record] }));
    setEditor(null);
  }

  return (
    <section className="content-page container">
      <PageHeader
        eyebrow="Skills"
        title="A practical, evolving toolkit."
        description={skills?.intro ?? "The tools I use to take products from a rough idea to reliable software."}
        aside={
          <div className="skill-orbit" aria-hidden="true">
            <Icon name="code" size={26} />
          </div>
        }
      />

      {isAdmin && <div className="portfolio-admin-toolbar"><p>Shape your toolkit as your skills evolve.</p><div><button className="button" type="button" disabled={!skills} onClick={() => setEditor({ kind: "overview" })}>Edit overview</button><button className="button button--primary" type="button" disabled={!skills} onClick={() => setEditor({ kind: "category", item: null })}><Icon name="plus" size={17} /> Add category</button></div></div>}
      {loading && !skills && <LoadingState label="Unpacking the toolkit" />}
      {error && <ErrorState message={error} onRetry={reload} retrying={loading} />}

      {skills && (
        <>
          {skills.principles.length > 0 && <div className="principles-panel reveal">
            <p className="eyebrow">How I work</p>
            <div className="principles-list">
              {skills.principles.map((principle, index) => (
                <div key={principle}>
                  <span>0{index + 1}</span>
                  <p>{principle}</p>
                </div>
              ))}
            </div>
          </div>}

          <div className="skills-grid">
            {!skills.categories.length && <p className="state-card">No skill categories yet.</p>}
            {skills.categories.map((category, index) => (
              <article
                className={`skill-card skill-card--${category.accent} reveal`}
                key={category.id}
                style={{ "--delay": `${index * 55}ms` }}
              >
                <div className="skill-card__top">
                  <span className="skill-index">0{index + 1}</span>
                  <span className="skill-dot" />
                </div>
                <h2>{category.name}</h2>
                <p>{category.description}</p>
                <div className="skill-tags">
                  {category.items.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
                {isAdmin && <ContentActions label={category.name} onEdit={() => setEditor({ kind: "category", item: category })} onDelete={() => setEditor({ kind: "delete", item: category })} />}
              </article>
            ))}
          </div>
        </>
      )}
      {editor?.kind === "category" && <SkillCategoryEditor item={editor.item} onClose={() => setEditor(null)} onSaved={savedCategory} />}
      {editor?.kind === "overview" && <SkillsOverviewEditor skills={skills} onClose={() => setEditor(null)} onSaved={(record) => { setData((current) => ({ ...current, intro: record.intro, principles: record.principles })); setEditor(null); }} />}
      {editor?.kind === "delete" && <DeleteContentDialog label={editor.item.name} onClose={() => setEditor(null)} onDelete={(token) => deleteSkillCategory(editor.item.id, token)} onDeleted={() => { setData((current) => ({ ...current, categories: current.categories.filter((item) => item.id !== editor.item.id) })); setEditor(null); }} />}
    </section>
  );
}

