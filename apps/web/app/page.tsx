import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <header className="topbar-wrap landing-topbar">
        <div className="shell topbar">
          <Link className="brand-mark" href="/">
            <span className="brand-badge">G</span>
            <span className="brand-copy">
              <strong>GenFren</strong>
              <small>Persistent agent workspace</small>
            </span>
          </Link>
          <nav className="topnav" aria-label="Landing">
            <Link className="topnav-item active" href="/">Overview</Link>
            <Link className="topnav-item" href="/auth/signup">Sign up</Link>
            <Link className="topnav-item" href="/auth/login">Login</Link>
            <Link className="topnav-item" href="/dashboard">Workspace</Link>
            <Link className="topnav-item" href="/briefings">Briefings</Link>
          </nav>
          <Link className="wallet-pill" href="/auth/signup">Create vault</Link>
        </div>
      </header>
      <main className="shell hero">
        <section className="hero-banner">
          <div className="hero-ornament left">
            <div className="orb-stack">
              <span />
              <span />
            </div>
          </div>
          <div className="hero-copy">
            <div className="eyebrow">Persistent intelligence for ongoing work</div>
            <h1>GenFren keeps the thread alive between sessions.</h1>
            <p>
              A private Web3-native companion that remembers context, tracks your priorities, and returns with useful briefings instead of making you restart from zero.
            </p>
            <div className="cta-row">
              <Link className="button primary" href="/auth/signup">Start your companion</Link>
              <Link className="button secondary" href="/auth/login">Login to vault</Link>
            </div>
          </div>
          <div className="hero-ornament right">
            <div className="hero-object">
              <div className="hero-card mini">
                <span className="mini-label">Continuity</span>
                <strong>Briefings tied to active goals</strong>
              </div>
              <div className="hero-card mini">
                <span className="mini-label">Memory</span>
                <strong>Preferences and work threads stay connected</strong>
              </div>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-intro">
            <div className="eyebrow">Why it feels different</div>
            <h2>Clean institutional fintech meets long-term agent workflows.</h2>
            <p className="muted">Data-dense where it matters, quiet everywhere else. Enough structure for serious work, enough warmth to feel personal.</p>
          </div>
          <div className="cards-3">
            <div className="panel feature-card">
              <div className="badge-row"><span className="badge-dot" /> Memory</div>
              <strong>Remembers your ongoing work</strong>
              <p className="muted">Goals, unfinished threads, research branches, and response preferences stay available over time.</p>
            </div>
            <div className="panel feature-card">
              <div className="badge-row"><span className="badge-dot" /> Briefings</div>
              <strong>Returns with useful updates</strong>
              <p className="muted">Daily or weekly summaries are shaped by your current focus instead of a generic watchlist.</p>
            </div>
            <div className="panel feature-card">
              <div className="badge-row"><span className="badge-dot" /> Specialists</div>
              <strong>Grows support without clutter</strong>
              <p className="muted">Research, drafting, and follow-up work can branch to specialists while the main surface stays calm.</p>
            </div>
          </div>
        </section>

        <section className="section-block">
          <div className="section-intro">
            <div className="eyebrow">First-run flow</div>
            <h2>Your first 10 minutes</h2>
          </div>
          <div className="cards-3">
            <div className="panel tour-step">
              <div className="step-pill">01</div>
              <strong>Create the vault</strong>
              <p className="muted">Start with a private account surface designed for continuity and recovery ownership.</p>
            </div>
            <div className="panel tour-step">
              <div className="step-pill">02</div>
              <strong>Set one strong mission</strong>
              <p className="muted">Choose a topic, an outcome, and a cadence that is narrow enough to stay valuable.</p>
            </div>
            <div className="panel tour-step">
              <div className="step-pill">03</div>
              <strong>Come back to momentum</strong>
              <p className="muted">Return to a system that already knows what changed, what matters, and what still needs attention.</p>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
