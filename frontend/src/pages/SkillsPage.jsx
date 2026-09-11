import { useEffect, useState } from "react";
import { getSkills } from "../api";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";
import { ErrorState, LoadingState } from "../components/Status";

export default function SkillsPage() {
  const [skills, setSkills] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getSkills(controller.signal)
      .then(setSkills)
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

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

      {loading && <LoadingState label="Unpacking the toolkit" />}
      {error && <ErrorState message={error} />}

      {skills && (
        <>
          <div className="principles-panel reveal">
            <p className="eyebrow">How I work</p>
            <div className="principles-list">
              {skills.principles.map((principle, index) => (
                <div key={principle}>
                  <span>0{index + 1}</span>
                  <p>{principle}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="skills-grid">
            {skills.categories.map((category, index) => (
              <article
                className={`skill-card skill-card--${category.accent} reveal`}
                key={category.name}
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
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

