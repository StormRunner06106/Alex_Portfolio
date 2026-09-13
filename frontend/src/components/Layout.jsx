import { useEffect, useId, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "./Icon";
import { useAdmin } from "./AdminSession";

const navItems = [
  { label: "About", to: "/" },
  { label: "Experience", to: "/experience" },
  { label: "Skills", to: "/skills" },
  { label: "Journal", to: "/blog" },
  { label: "Contact", to: "/contact" },
];

function Header({ name }) {
  const { isAdmin, checking, openSignIn } = useAdmin();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationId = useId();
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <NavLink className="brand" to="/" aria-label={`${name} home`}>
          <img className="brand-mark brand-photo" src="/alex-avatar-96.webp" width="42" height="42" alt="" />
          <span className="brand-name">{name}</span>
        </NavLink>

        <div className="header-actions">
        <div className="nav-positioner">
        <div className="container nav-positioner__inner">
        <nav id={navigationId} className={`nav-shell ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          {navItems.map((item) => (
            <NavLink
              className={({ isActive }) => `nav-link ${isActive ? "is-active" : ""}`}
              end={item.to === "/"}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <button
          aria-expanded={menuOpen}
          aria-controls={navigationId}
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          className="menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
        </div>
        </div>
        <button type="button" className={`icon-button header-signin ${isAdmin ? "is-admin" : ""}`}
          aria-label={isAdmin ? "Admin account" : "Admin sign in"} title={isAdmin ? "Admin account" : "Admin sign in"}
          aria-haspopup="dialog" disabled={checking} onClick={openSignIn}>
          <Icon name={isAdmin ? "user" : "lock"} />
          {isAdmin && <span className="admin-indicator" />}
        </button>
        </div>
      </div>
    </header>
  );
}

function Footer({ name }) {
  const now = new Date();
  const monthAndYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "numeric",
  }).format(now);

  return (
    <footer className="site-footer">
      <div className="container footer-inner">
        <p>© {now.getFullYear()} · All rights reserved · {monthAndYear}</p>
        <p className="signature" aria-label={`${name} signature`}>
          {name}
        </p>
      </div>
    </footer>
  );
}

export default function Layout({ children, profile }) {
  const location = useLocation();
  const name = profile?.display_name ?? "Alex Herlan";
  const isAbout = location.pathname === "/";

  useEffect(() => {
    let pressed = null;
    let origin = null;
    const clear = () => {
      pressed?.removeAttribute("data-pressed");
      pressed = null;
      origin = null;
    };
    const press = (event) => {
      clear();
      if (!event.isPrimary || event.button !== 0) return;
      const control = event.target.closest?.(".button, .culture-link");
      if (!control || control.matches(":disabled")) return;
      pressed = control;
      origin = { x: event.clientX, y: event.clientY };
      pressed.setAttribute("data-pressed", "true");
    };
    const move = (event) => {
      if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 10) clear();
    };
    window.addEventListener("pointerdown", press, { passive: true });
    window.addEventListener("pointermove", move, { passive: true });
    window.addEventListener("pointerup", clear);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
    return () => {
      clear();
      window.removeEventListener("pointerdown", press);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", clear);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("blur", clear);
    };
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to content</a>
      <Header name={name} />
      <main className={`site-main ${isAbout ? "site-main--about" : ""}`} id="main-content">
        {children}
      </main>
      <Footer name={name} />
    </div>
  );
}
