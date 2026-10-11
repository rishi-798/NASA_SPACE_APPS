import { ArrowUpRight, List, Moon, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

const links = [
  { to: "/trip", label: "Plan a trip" },
  { to: "/explorer", label: "Explorer" },
  { to: "/missions", label: "Missions" },
  { to: "/timeline", label: "Timeline" },
  { to: "/about", label: "About" },
];

export function Navigation() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <header className="topbar">
      <NavLink className="wordmark" to="/" aria-label="CLPS Lunar home" onClick={() => setOpen(false)}>
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

      <NavLink className="nav-explore" to="/explorer">Open Explorer <ArrowUpRight aria-hidden="true" /></NavLink>

      <button
        className="menu-button"
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        aria-controls="mobile-navigation"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <X /> : <List />}
      </button>

      {open && (
        <nav id="mobile-navigation" className="mobile-nav" aria-label="Mobile navigation">
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
