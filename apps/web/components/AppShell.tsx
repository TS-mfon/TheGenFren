import Link from "next/link";
import { ReactNode } from "react";

const navItems = [
  { href: "/dashboard", label: "Home" },
  { href: "/agent", label: "Chat" },
  { href: "/briefings", label: "Briefings" },
  { href: "/tasks", label: "Tasks" },
  { href: "/subagents", label: "Specialists" },
  { href: "/delegation", label: "Shared access" },
  { href: "/memory", label: "Memory" }
] as const;

export function AppShell({ children, section }: { children: ReactNode; section: string }) {
  return (
    <>
      <header className="topbar-wrap">
        <div className="shell topbar">
          <Link className="brand-mark" href="/dashboard">
            <span className="brand-badge">G</span>
            <span className="brand-copy">
              <strong>GenFren</strong>
              <small>Persistent agent workspace</small>
            </span>
          </Link>
          <nav className="topnav" aria-label="Primary">
            {navItems.map((item) => {
              const active = section === item.href.replace("/", "") || (item.href === "/dashboard" && section === "dashboard");
              return (
                <Link key={item.href} className={`topnav-item${active ? " active" : ""}`} href={item.href}>
                  <span className="nav-dot" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="wallet-pill">Private vault</div>
        </div>
      </header>
      <div className="shell app-shell">
        <aside className="workspace-rail">
          <div className="rail-card">
            <div className="eyebrow">Today</div>
            <h2>One calm surface for ongoing work.</h2>
            <p className="muted">Briefings, memory, tasks, and specialist support stay organized without turning into a control panel maze.</p>
          </div>
          <div className="rail-card">
            <div className="eyebrow">Working model</div>
            <div className="rail-list">
              <div>
                <strong>Follow one thread deeply</strong>
                <p className="muted">Keep the mission narrow enough that the return visits stay useful.</p>
              </div>
              <div>
                <strong>Add specialists when needed</strong>
                <p className="muted">Let side work branch quietly instead of cluttering the main workspace.</p>
              </div>
            </div>
          </div>
        </aside>
        <main className="page">{children}</main>
      </div>
    </>
  );
}
