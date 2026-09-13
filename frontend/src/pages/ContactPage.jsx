import { useState } from "react";
import { sendContactMessage } from "../api";
import Icon from "../components/Icon";
import PageHeader from "../components/PageHeader";

const initialForm = {
  name: "",
  email: "",
  subject: "",
  message: "",
  company: "",
};

export default function ContactPage({ profile, error }) {
  const [form, setForm] = useState(initialForm);
  const [status, setStatus] = useState({ type: "idle", message: "" });

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submitForm(event) {
    event.preventDefault();
    setStatus({ type: "sending", message: "Sending your note…" });
    try {
      const result = await sendContactMessage(form);
      setStatus({ type: "success", message: result.message });
      setForm(initialForm);
    } catch (requestError) {
      setStatus({ type: "error", message: requestError.message });
    }
  }

  const socials = profile?.socials ?? [];
  const interests = profile?.interests ?? [];

  return (
    <section className="content-page container contact-page">
      <PageHeader
        eyebrow="Contact"
        title="Have a useful problem to solve?"
        description="Tell me what you’re building, where it feels stuck, and what a good outcome looks like. I’ll take it from there."
        aside={<div className="contact-pulse"><span /> Usually replies within 1–2 days</div>}
      />

      <div className="contact-grid">
        <form className="contact-form reveal" onSubmit={submitForm}>
          <div className="form-row">
            <label>
              <span>Your name</span>
              <input
                autoComplete="name"
                minLength="2"
                name="name"
                onChange={updateField}
                placeholder="Jane Smith"
                required
                value={form.name}
              />
            </label>
            <label>
              <span>Email address</span>
              <input
                autoComplete="email"
                name="email"
                onChange={updateField}
                placeholder="jane@company.com"
                required
                type="email"
                value={form.email}
              />
            </label>
          </div>

          <label>
            <span>What’s this about?</span>
            <input
              minLength="3"
              name="subject"
              onChange={updateField}
              placeholder="A product, role, or interesting collaboration"
              required
              value={form.subject}
            />
          </label>

          <label>
            <span>Your message</span>
            <textarea
              maxLength="5000"
              minLength="20"
              name="message"
              onChange={updateField}
              placeholder="A little context goes a long way…"
              required
              rows="7"
              value={form.message}
            />
          </label>

          <label className="honeypot" aria-hidden="true">
            Company
            <input name="company" onChange={updateField} tabIndex="-1" value={form.company} />
          </label>

          <div className="form-footer">
            <button className="button button--primary" disabled={status.type === "sending"} type="submit">
              {status.type === "sending" ? "Sending…" : "Send message"}
              <Icon name="send" size={18} />
            </button>
            {status.type !== "idle" && (
              <p className={`form-status form-status--${status.type}`} role="status">{status.message}</p>
            )}
          </div>
        </form>

        <aside className="contact-aside reveal reveal--delay">
          <div className="contact-note">
            <Icon name="spark" size={24} />
            <h2>Good conversations start with clarity.</h2>
            <p>I’m especially interested in full-stack product work, applied AI, and systems that make demanding workflows feel calmer.</p>
          </div>

          <div className="social-list">
            <p className="eyebrow">Find me here</p>
            {socials.map((social) => (
              <a href={social.href} key={social.kind} target={social.kind === "email" ? undefined : "_blank"} rel="noreferrer">
                <span className="social-icon"><Icon name={social.kind} /></span>
                <span>
                  <small>{social.label}</small>
                  <strong>{social.value}</strong>
                </span>
                <Icon name="arrowUpRight" size={18} />
              </a>
            ))}
            {error && <p className="social-error">Contact links are temporarily unavailable.</p>}
          </div>
        </aside>
      </div>

      <div className="culture-card culture-card--wide reveal">
        <img className="culture-photo" src="/alex_music.jpg" alt="Alex playing guitar" width="206" height="206" loading="lazy" />
        <div className="culture-content">
        <div className="culture-intro">
          <p className="eyebrow">Beyond the build</p>
          <h2><strong>I love music</strong> and nearly always have something playing on Spotify.</h2>
          <p>Off the clock, I share a little life on Instagram and occasionally disappear into a game on Steam.</p>
        </div>
        <div className="culture-links">
          {interests.map((interest) => (
            <a
              className={`culture-link culture-link--${interest.kind}`}
              href={interest.href}
              key={interest.kind}
              rel="noreferrer"
              target="_blank"
            >
              <span className="culture-link__icon"><Icon name={interest.kind} /></span>
              <span><small>{interest.note}</small><strong>{interest.label}</strong></span>
              <Icon name="arrowUpRight" size={18} />
            </a>
          ))}
        </div>
        </div>
      </div>
    </section>
  );
}
