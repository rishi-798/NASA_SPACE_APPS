import { ArrowUpRight, List, Moon, X } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

const links = [
  { to: "/explorer", label: "Analyze a site" },
  { to: "/trip", label: "Plan a trip" },
  { to: "/planner", label: "Flight phases" },
  { to: "/missions", label: "Missions" },
];

export function Navigation() {
  const { pathname } = useLocation();
  const home = "/brahmos/index.html?return=1#top";
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

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
      <a className="wordmark" href={home} aria-label="BRAHMOS home"><Moon weight="fill" /><span>BRAHMOS</span></a>

      <nav className="desktop-nav" aria-label="Primary navigation">
        <a className="nav-link" href="/brahmos/index.html?return=1#about">About</a>
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
          <a className="mobile-nav-link" href="/brahmos/index.html?return=1#about">About</a>
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
