import type { ReactNode } from "react";
import { SignUp, SiteFooter, SiteNav } from "./Home";
import { ImageIcon } from "./components";

const VALUES: Array<[ReactNode, string, string]> = [
  [<ImageIcon key="a" file="appointment.png" size={26} />, "Patients first", "Every minute in a waiting room is a minute away from family. We show patients exactly when they'll be seen."],
  [<ImageIcon key="r" file="restock.png" size={26} />, "Clinics that run smoothly", "Supplies ready before they're needed, instruments sterilized, and nothing lost in a spreadsheet."],
  [<ImageIcon key="f" file="food_icon.png" size={26} />, "Health beyond the visit", "Good care continues at the table, with meal plans built from local food, a real budget, and real nutrition."],
];

export function About() {
  return (
    <div className="home">
      <SiteNav current="about" />

      <main>
        <section className="about-hero" aria-labelledby="about-title">
          <span className="eyebrow">About us</span>
          <h1 id="about-title">
            Built so Care can run <span className="hl">on time.</span>
          </h1>
          <p className="hero-sub">
            Recura brings appointments, medical supplies, and nutrition into one Access Portal. We build for the patients who wait,
            the clinic teams who keep everything moving, and the families who count on both.
          </p>
        </section>

        {/* Tribute: kept to what we know of her support; add specific details here as they're confirmed. */}
        <section className="home-section tribute-wrap" aria-labelledby="tribute-title">
          <article className="tribute">
            <div className="tribute-mark" aria-hidden="true">
              <ImageIcon file="about us.png" size={44} />
            </div>
            <div className="tribute-body">
              <span className="eyebrow">In appreciation</span>
              <h2 id="tribute-title">Ms. Perrigiene</h2>
              <p className="tribute-lede">A champion for medicine and for children.</p>
              <p>
                Ms. Perrigiene believes that every child deserves care that is close by, on time, and given with kindness. Her
                support for medicine and for children is a reminder that behind every appointment and every supply shelf is a
                family hoping for the best for their kids.
              </p>
              <p>
                That belief is at the heart of Recura. When a clinic runs smoothly, a parent spends less time waiting and more time
                with their child, the right supplies are ready when a little one needs them, and every meal plan is built to help
                children grow strong. We carry her support forward in everything we build: medicine should feel caring, and
                children should always come first.
              </p>
              <p className="tribute-sign">Thank you, Ms. Perrigiene.</p>
            </div>
          </article>
        </section>

        <section className="home-section" aria-labelledby="values-title">
          <div className="section-head">
            <span className="eyebrow">What we believe</span>
            <h2 id="values-title">Care that respects everyone's time</h2>
          </div>
          <div className="feature-grid">
            {VALUES.map(([icon, title, text]) => (
              <div key={title} className="feature">
                <span className="value-icon">{icon}</span>
                <h3>{title}</h3>
                <p className="muted">{text}</p>
              </div>
            ))}
            <div className="feature">
              <span className="value-icon">
                <ImageIcon file="trust_by_design.png" size={26} />
              </span>
              <h3>Trust by design</h3>
              <p className="muted">No double bookings, clear update times, and AI that works from real data, not guesses.</p>
            </div>
          </div>
        </section>

        <section className="cta-band" aria-labelledby="about-cta-title">
          <div>
            <h2 id="about-cta-title">See Recura in action.</h2>
            <p>One sign-in. Every workflow. Start in seconds.</p>
          </div>
          <SignUp variant="light" />
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
