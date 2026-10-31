import type { ReactNode } from "react";
import { navigate } from "./api";
import { BrandLogo } from "./Login";
import { PhotoThumb, type PhotoFile } from "./Photo";
import { IconArrow, IconChart, IconCheck, IconClock, IconPhone, IconShield, IconSparkle, ImageIcon } from "./icons";

export const go = (path: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  navigate(path);
  window.scrollTo(0, 0);
};

export function SignUp({ workflow, children = "Sign Up", variant = "primary" }: { workflow?: string; children?: ReactNode; variant?: string }) {
  const href = workflow ? `/signup?workflow=${workflow}` : "/signup";
  return (
    <a className={`btn ${variant} lg`} href={href} onClick={go(href)}>
      {children} <IconArrow />
    </a>
  );
}

const WORKFLOW_CARDS = [
  {
    audience: "Patient flow",
    title: "Patient appointments",
    blurb: "Keep every patient informed and your waiting room calm, even when the schedule runs late.",
    photo: "Patient-appointment-coordination.jpeg" as PhotoFile,
    tone: "pumpkin",
    workflow: "appointment",
    points: ["Patients see live wait times after delays", "Self check-in frees up the front desk", "Patients reschedule into open slots on their own", "Know who arrived on time and who was late"],
  },
  {
    audience: "Supplies",
    title: "Restock medical supplies",
    blurb: "Every glove, gauze pad, and instrument tracked from purchase to replacement.",
    photo: "medical supplies.png" as PhotoFile,
    tone: "brown",
    workflow: "restock",
    points: ["Reorder dates from real usage", "Sterilize-after-every-appointment tracking", "Consumption by location", "Export to accounting in one click"],
  },
  {
    audience: "Nutrition",
    title: "Food recommendations",
    blurb: "Give patients and staff a month of healthy meals from your local market, on budget.",
    photo: "food rec.jpg" as PhotoFile,
    tone: "sage",
    workflow: "food",
    points: ["AI meal plans from local market items", "Plan one day or the rest of the month", "Calories, budget, macros, and micronutrients", "Adapts to real eating habits"],
  },
];

const FEATURES: Array<[ReactNode, string, string]> = [
  [<IconShield key="s" />, "Accept all patients wherever they come from", "Walk-ins, referrals, and returning patients all land on one schedule your team can trust."],
  [<IconPhone key="p" />, "Your team, on any device", "Staff restock from a phone in the supply room; patients check status from their watch."],
  [<IconClock key="c" />, "Always up to date", "Every screen shows when it was last updated, so no one acts on stale information."],
  [<IconSparkle key="a" />, "AI your clinic can trust", "Nutrition advice is built from real food data, not guesses."],
];

/** Goes to a section of the home page, from the home page or from another page. */
const goSection = (id: string) => (e: React.MouseEvent) => {
  e.preventDefault();
  if (window.location.pathname !== "/") navigate("/");
  // Coming from another page, the home page renders on the next frames; wait for the section.
  let tries = 0;
  const scroll = () => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (tries++ < 30) requestAnimationFrame(scroll);
  };
  requestAnimationFrame(scroll);
};

/** Top bar shared by the public pages (home and About us). */
export function SiteNav({ current }: { current?: "about" }) {
  return (
    <header className="home-nav">
      <BrandLogo />
      <nav aria-label="Site" className="home-links">
        <a href="/#workflows" onClick={goSection("workflows")}>
          Workflows
        </a>
        <a href="/#features" onClick={goSection("features")}>
          Features
        </a>
        <a className="about-link" href="/about" onClick={go("/about")} aria-current={current === "about" ? "page" : undefined}>
          <ImageIcon file="about us.png" size={18} />
          About us
        </a>
      </nav>
      <div className="home-nav-cta">
        <a className="btn ghost" href="/login" onClick={go("/login")}>
          Sign in
        </a>
        <a className="btn primary" href="/signup" onClick={go("/signup")}>
          Sign Up
        </a>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="home-foot">
      <a className="brand" href="/" onClick={go("/")} aria-label="Recura home page">
        <span>Recura</span>
      </a>
      <nav aria-label="Footer" className="foot-links">
        <a className="about-link" href="/about" onClick={go("/about")}>
          <ImageIcon file="about us.png" size={16} />
          About us
        </a>
        <a href="/login" onClick={go("/login")}>
          Access Portal
        </a>
      </nav>
      <span className="muted small">
        <IconChart size={14} /> Appointments · Supplies · Nutrition
      </span>
      <span className="muted small">© {new Date().getFullYear()} Recura Health</span>
    </footer>
  );
}

export function Home() {
  return (
    <div className="home">
      <SiteNav />

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <h1 id="hero-title">
              Run your clinic <span className="hl">on time.</span>
            </h1>
            <p className="hero-sub">
              Recura gives your clinic one Access Portal for appointments, medical supplies, and nutrition, so your team
              spends less time juggling and more time caring for patients.
            </p>
            <div className="hero-cta">
              <SignUp />
            </div>
          </div>

          <div className="hero-visual" aria-hidden="true">
            <div className="hero-orb" />
            <div className="hero-frame">
              <img src="/logic_core.png" alt="" width={247} height={118} />
            </div>
            <div className="float-card fc-1">
              <span className="fc-icon pumpkin">
                <ImageIcon file="appointment.png" />
              </span>
              <div>
                <span className="fc-label">Expected start</span>
                <strong>4:20 PM</strong>
                <span className="fc-sub">Running 20 min behind</span>
              </div>
            </div>
            <div className="float-card fc-2">
              <span className="fc-icon brown">
                <ImageIcon file="restock.png" />
              </span>
              <div>
                <span className="fc-label">Nitrile gloves</span>
                <strong>Reorder by Nov 2</strong>
                <span className="fc-sub">4.3 used per day</span>
              </div>
            </div>
            <div className="float-card fc-3">
              <span className="fc-icon sage">
                <ImageIcon file="food_icon.png" />
              </span>
              <div>
                <span className="fc-label">Monday</span>
                <strong>2,247 kcal · $6.70</strong>
                <span className="fc-sub">Protein 16% · Fiber 239%</span>
              </div>
            </div>
          </div>
        </section>

        <section id="workflows" className="home-section" aria-labelledby="wf-title">
          <div className="section-head">
            <h2 id="wf-title">Everything your clinic runs on</h2>
            <p>Your whole team signs in to one Access Portal, and each person sees the workflows that are theirs.</p>
          </div>
          <div className="part-grid">
            {WORKFLOW_CARDS.map((p) => (
              <article key={p.workflow} className={`part-card ${p.tone}`}>
                <div className="part-top">
                  <PhotoThumb file={p.photo} className="part-photo" />
                  <span className="part-tag">{p.audience}</span>
                </div>
                <h3>{p.title}</h3>
                <p className="muted">{p.blurb}</p>
                <ul>
                  {p.points.map((pt) => (
                    <li key={pt}>
                      <IconCheck size={16} /> {pt}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section id="features" className="home-section features-split" aria-labelledby="feat-title">
          <div className="features-head">
            <span className="eyebrow">Built for busy clinics</span>
            <h2 id="feat-title">Fast, consistent, and always available</h2>
          </div>
          <div className="feature-grid four-by-one">
            {FEATURES.map(([icon, title, text]) => (
              <div key={title} className="feature">
                <span className="feature-icon">{icon}</span>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="cta-band" aria-labelledby="cta-title">
          <div>
            <h2 id="cta-title">Ready to run your clinic on time?</h2>
            <p>One sign-in for your whole team. Every workflow. Start in seconds.</p>
          </div>
          <SignUp variant="light" />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
