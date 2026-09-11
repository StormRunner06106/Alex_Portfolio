import Icon from "../components/Icon";
import { ErrorState, LoadingState } from "../components/Status";

export default function AboutPage({ profile, error }) {
  if (error) {
    return (
      <div className="container centered-state">
        <ErrorState message={error} />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="container centered-state">
        <LoadingState label="Loading Alex’s profile" />
      </div>
    );
  }

  return (
    <section className="about-page container">
      <div className="about-copy reveal">
        <p className="eyebrow">
          <span className="availability-dot" />
          {profile.eyebrow}
        </p>
        <h1>
          Hello, I’m <span>{profile.display_name}.</span>
        </h1>
        <h2>{profile.headline}</h2>
        <p className="about-summary">{profile.summary}</p>

        <div className="hero-actions">
          <a className="button button--primary" href={profile.resume_url} target="_blank" rel="noreferrer">
            Open CV
            <Icon name="arrowUpRight" size={18} />
          </a>
          <a className="button button--quiet" href={profile.socials.find((social) => social.kind === "email")?.href}>
            Let’s talk
            <Icon name="arrow" size={18} />
          </a>
        </div>

        <div className="focus-row" aria-label="Current focus areas">
          {profile.focus.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>

      <div className="portrait-stage reveal reveal--delay">
        <div className="portrait-orbit portrait-orbit--one" />
        <div className="portrait-orbit portrait-orbit--two" />
        <div className="portrait-frame">
          <img src={profile.portrait} alt={`${profile.name}, senior software engineer`} />
        </div>
        <div className="experience-note">
          <strong>27+</strong>
          <span>years building<br />with technology</span>
        </div>
        <div className="availability-note">
          <Icon name="spark" size={18} />
          <span>{profile.availability}</span>
        </div>
      </div>
    </section>
  );
}

