import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Icon from "./Icon";

const navItems = [
  { label: "About", to: "/" },
  { label: "Experience", to: "/experience" },
  { label: "Skills", to: "/skills" },
  { label: "Journal", to: "/blog" },
  { label: "Contact", to: "/contact" },
];

function Header({ name }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => setMenuOpen(false), [location.pathname]);

  return (
    <header className="site-header">
      <div className="container header-inner">
        <NavLink className="brand" to="/" aria-label={`${name} home`}>
          <span className="brand-mark">AH</span>
          <span className="brand-name">{name}</span>
        </NavLink>

        <nav className={`nav-shell ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
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
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          className="menu-button"
          onClick={() => setMenuOpen((open) => !open)}
          type="button"
        >
          <Icon name={menuOpen ? "close" : "menu"} />
        </button>
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
