import { List, Moon, X } from "@phosphor-icons/react";
import { useState } from "react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/explorer", label: "Explorer" },
  { to: "/missions", label: "Missions" },
  { to: "/timeline", label: "Timeline" },
  { to: "/about", label: "About" },
];

export function Navigation() {
  const [open, setOpen] = useState(false);

  return (
    <header className="topbar">
      <NavLink className="wordmark" to="/explorer" aria-label="CLPS Lunar home">
        <span className="wordmark-mark" aria-hidden="true">
          <Moon weight="fill" />
        </span>
        <span>CLPS</span>
        <span className="wordmark-divider">/</span>
        <span className="wordmark-muted">LUNAR</span>
      </NavLink>

      <nav className="desktop-nav" aria-label="Primary navigation">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `nav-link${isActive ? " nav-link-active" : ""}`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="project-stamp" aria-label="Project context">
        <span>NASA SPACE APPS</span>
        <span>2026</span>
      </div>

      <button
        className="menu-button"
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <List />}
      </button>

      {open && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `mobile-nav-link${isActive ? " mobile-nav-link-active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <div className="mobile-nav-meta">NASA SPACE APPS · 2026</div>
        </nav>
      )}
    </header>
  );
}
