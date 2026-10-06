"use client";

import { useState, useEffect } from "react";
import { PROPERTY_TYPE_LABELS } from "../lib/data/propertyTypeClassifier";
import { useLocale } from "../components/LocaleProvider";

const CAPABILITY_ROW_1 = [
  { key: "cap.rendement", color: "accent" },
  { key: "cap.cadastre", color: "blue" },
  { key: "cap.risques", color: "green" },
  { key: "cap.comparables", color: "accent" },
  { key: "cap.analyse", color: "blue" },
];

const CAPABILITY_ROW_2 = [
  { key: "cap.dossier", color: "green" },
  { key: "cap.loyer", color: "accent" },
  { key: "cap.scenarios", color: "blue" },
  { key: "cap.checklist", color: "amber" },
  { key: "cap.comparateur", color: "green" },
];

const TESTIMONIALS = [
  { quoteKey: "testimonials.1.quote", roleKey: "testimonials.1.role", name: "Thomas" },
  { quoteKey: "testimonials.2.quote", roleKey: "testimonials.2.role", name: "Sarah" },
  { quoteKey: "testimonials.3.quote", roleKey: "testimonials.3.role", name: "Julien" },
  { quoteKey: "testimonials.4.quote", roleKey: "testimonials.4.role", name: "Nicolas" },
];

function CapabilityMarquee() {
  const { t } = useLocale();
  return (
    <section className="capability-marquee" aria-hidden="true">
      <div className="capability-marquee-rows">
        <div className="capability-marquee-track">
          {[...CAPABILITY_ROW_1, ...CAPABILITY_ROW_1].map((c, i) => (
            <span className="capability-pill" key={"r1-" + i}>
              <span className={"capability-dot capability-dot-" + c.color} />
              {t(c.key)}
            </span>
          ))}
        </div>
        <div className="capability-marquee-track reverse">
          {[...CAPABILITY_ROW_2, ...CAPABILITY_ROW_2].map((c, i) => (
            <span className="capability-pill" key={"r2-" + i}>
              <span className={"capability-dot capability-dot-" + c.color} />
              {t(c.key)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stars() {
  return (
    <div className="testimonial-stars" aria-hidden="true">
      {"★★★★★"}
    </div>
  );
}

function Testimonials() {
  const { t } = useLocale();
  return (
    <section className="testimonials">
      <div className="testimonials-intro">
        <span className="eyebrow">{t("testimonials.eyebrow")}</span>
        <h2>{t("testimonials.title")}</h2>
      </div>
      <div className="testimonials-track">
        {TESTIMONIALS.map((item) => (
          <figure className="testimonial-card" key={item.name}>
            <Stars />
            <blockquote>“{t(item.quoteKey)}”</blockquote>
            <figcaption>
              <span className="testimonial-name">{item.name}</span>
              <span className="testimonial-role">{t(item.roleKey)}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}

const MOBILE_REVIEWS = [
  { number: "01", quoteKey: "mreview.1.quote", roleKey: "mreview.1.role", name: "Thomas", tint: "peach", pin: "accent" },
  { number: "02", quoteKey: "mreview.2.quote", roleKey: "mreview.2.role", name: "Sarah", tint: "lavender", pin: "blue" },
  { number: "03", quoteKey: "mreview.3.quote", roleKey: "mreview.3.role", name: "Julien", tint: "peach", pin: "accent" },
  { number: "04", quoteKey: "mreview.4.quote", roleKey: "mreview.4.role", name: "Nicolas", tint: "lavender", pin: "blue" },
];

function MobileReviewsShowcase() {
  const { t } = useLocale();
  return (
    <section className="mobile-reviews">
      <div className="mobile-reviews-intro">
        <span className="eyebrow">{t("testimonials.eyebrow")}</span>
        <h2>{t("testimonials.title")}</h2>
      </div>
      <div className="mobile-reviews-track">
        {MOBILE_REVIEWS.map((r, i) => (
          <div
            className={`mreview-card mreview-${r.tint}` + (i % 2 === 1 ? " mreview-right" : "")}
            key={r.name}
          >
            <span className={`mreview-pin mreview-pin-${r.pin}`} />
            <span className="mreview-number">{r.number}</span>
            <Stars />
            <blockquote>“{t(r.quoteKey)}”</blockquote>
            <div className="mreview-name">— {r.name}, {t(r.roleKey)}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

const PROPERTY_CATEGORY_ICONS: Record<string, string> = { hotel: "🏨", chateau: "🏰", immeuble: "🏢", penthouse: "🏙️", loft: "🧱", duplex: "🏘️", chalet: "🏔️", local_commercial: "🏬", terrain: "🌳", parking: "🅿️", studio: "🚪", maison: "🏡", appartement: "🏠" };

function PropertyCategoriesShowcase() {
const { t } = useLocale();
const categories = Object.entries(PROPERTY_TYPE_LABELS);
const [active, setActive] = useState(categories[0][0]);
const activeIndex = categories.findIndex(([code]) => code === active);
return (
<section className="categories-band">
<div className="categories-intro">
<span className="eyebrow">{t("categories.eyebrow")}</span>
<h2>{t("categories.title1")}<br />{t("categories.title2")}</h2>
<p className="sub">{t("categories.sub")}</p>
</div>
<div className="categories-picker">
<div className="categories-picker-track">
{categories.map(([code, label], i) => {
const isActive = code === active;
const dist = Math.min(Math.abs(activeIndex - i), 2);
const angle = (dist * 10 * Math.PI) / 180;
const radius = 70;
const xOffset = isActive ? -16 : radius * (1 - Math.cos(angle));
const itemScale = isActive ? 1 : Math.max(0.9, 1 - dist * 0.05);
const itemOpacity = isActive ? 1 : Math.max(0.85, 1 - dist * 0.08);
const labelOpacity = isActive ? 1 : Math.max(0.9, 1 - dist * 0.05);
const itemStyle = { transform: `translateX(${xOffset}px) scale(${itemScale})`, opacity: itemOpacity };
return (
<button type="button" key={code} className={`categories-picker-item${isActive ? " categories-picker-item-active" : ""}`} style={itemStyle} onClick={() => setActive(code)}>
<span className="categories-picker-icon">{PROPERTY_CATEGORY_ICONS[code] || "🏠"}</span>
<span className="categories-picker-label" style={{ opacity: labelOpacity }}>{label}</span>
{isActive ? <span className="categories-picker-handle" /> : null}
</button>
);
})}
</div>
</div>
</section>
);
}

const HERO_FLOAT_ITEMS = [
{ key: "floaters.rendement", top: "6%", left: "13vw", n: 1, color: "accent" },
{ key: "floaters.marche", top: "56%", left: "8vw", n: 2, color: "green" },
{ key: "floaters.risques", top: "4%", right: "12vw", n: 3, color: "amber" },
{ key: "floaters.dossier", top: "58%", right: "9vw", n: 4, color: "blue" },
];

function HeroFloaters() {
const { t } = useLocale();
return (
<div className="hero-floaters" aria-hidden="true">
{HERO_FLOAT_ITEMS.map((item) => (
<div
key={item.key}
className={`hero-float hero-float-${item.n} hero-float-${item.color}`}
style={{ top: item.top, left: item.left, right: item.right }}
>
<span className="hero-float-shine" />
<span className="hero-float-dot" />
{t(item.key)}
</div>
))}
</div>
);
}

export default function Home() {
  const { t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <main className="page">
      <nav className={"nav nav-has-burger nav-floating" + (scrolled ? " nav-floating-scrolled" : "")}>
        <div className="brand"><span className="mark">B</span>Bricky</div>
        <button
          type="button"
          className={"nav-burger" + (menuOpen ? " nav-burger-open" : "")}
          aria-label={menuOpen ? t("nav.menuClose") : t("nav.menuOpen")}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className={"nav-links" + (menuOpen ? " nav-links-open" : "")}>
          <a className="navlink" href="/pricing" onClick={() => setMenuOpen(false)}>{t("nav.pricing")}</a>
          <a className="navlink" href="/login" onClick={() => setMenuOpen(false)}>{t("nav.login")}</a>
          <a className="nav-cta" href="/analyze" onClick={() => setMenuOpen(false)}>{t("nav.cta")}</a>
        </div>
      </nav>

      <section className="hero">
        <HeroFloaters />
        <span className="eyebrow">{t("hero.eyebrow")}</span>
        <h1>{t("hero.headlinePre")}<span className="stroke">{t("hero.headlineStroke")}</span>{t("hero.headlineMid")}<span className="accent">{t("hero.headlineAccent")}</span>{t("hero.headlinePost")}</h1>
        <p className="sub">
          {t("hero.sub")}
        </p>

        <form className="analyzer" action="/analyze">
          <input name="url" placeholder={t("hero.inputPlaceholder")} aria-label={t("hero.inputAriaLabel")} />
          <button type="submit">{t("hero.submit")}</button>
        </form>
        <div className="proof">{t("hero.proof")}</div>
        <div className="trial-note">{t("hero.trialNote")}</div>
        <a className="trial-note" href="/demo" style={{ display: "block", textDecoration: "underline" }}>{t("hero.demoLink")}</a>
      </section>

      <CapabilityMarquee />

      <section className="steps">
        <div className="steps-intro">
          <span className="eyebrow">{t("steps.eyebrow")}</span>
          <h2>{t("steps.title")}</h2>
        </div>
        <div className="steps-grid">
          <article className="card step-card">
            <span className="step-number">1</span>
            <h2>{t("steps.1.title")}</h2>
            <p>{t("steps.1.desc")}</p>
          </article>
          <article className="card step-card">
            <span className="step-number">2</span>
            <h2>{t("steps.2.title")}</h2>
            <p>{t("steps.2.desc")}</p>
          </article>
          <article className="card step-card">
            <span className="step-number">3</span>
            <h2>{t("steps.3.title")}</h2>
            <p>{t("steps.3.desc")}</p>
          </article>
        </div>
      </section>

      <section className="features">
        <details className="card info-card">
          <summary>
            <span className="info-number">1</span>
            <h2>{t("features.1.title")}</h2>
            <p>{t("features.1.desc")}</p>
            <span className="info-more-btn">{t("features.more")} <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">{t("features.1.more")}</div>
        </details>
        <details className="card info-card">
          <summary>
            <span className="info-number">2</span>
            <h2>{t("features.2.title")}</h2>
            <p>{t("features.2.desc")}</p>
            <span className="info-more-btn">{t("features.more")} <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">{t("features.2.more")}</div>
        </details>
        <details className="card info-card">
          <summary>
            <span className="info-number">3</span>
            <h2>{t("features.3.title")}</h2>
            <p>{t("features.3.desc")}</p>
            <span className="info-more-btn">{t("features.more")} <span className="chevron">▾</span></span>
          </summary>
          <div className="info-more">{t("features.3.more")}</div>
        </details>
      </section>

      <Testimonials />

      <MobileReviewsShowcase />

      <PropertyCategoriesShowcase />

      <section className="highlight-band">
        <div className="highlight-intro">
          <span className="eyebrow">{t("highlight1.eyebrow")}</span>
          <h2>{t("highlight1.title")}</h2>
        </div>
        <div className="highlight-grid">
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">01</span><span className="highlight-tag">{t("highlight1.1.tag")}</span></div>
            <h3>{t("highlight1.1.title")}</h3>
            <p>{t("highlight1.1.desc")}</p>
            <div className="highlight-stat">{t("highlight1.1.stat")}</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">02</span><span className="highlight-tag">{t("highlight1.2.tag")}</span></div>
            <h3>{t("highlight1.2.title")}</h3>
            <p>{t("highlight1.2.desc")}</p>
            <div className="highlight-stat">{t("highlight1.2.stat")}</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">03</span><span className="highlight-tag">{t("highlight1.3.tag")}</span></div>
            <h3>{t("highlight1.3.title")}</h3>
            <p>{t("highlight1.3.desc")}</p>
            <div className="highlight-stat">{t("highlight1.3.stat")}</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">04</span><span className="highlight-tag">{t("highlight1.4.tag")}</span></div>
            <h3>{t("highlight1.4.title")}</h3>
            <p>{t("highlight1.4.desc")}</p>
            <div className="highlight-stat">{t("highlight1.4.stat")}</div>
          </div>
        </div>
      </section>

      <section className="highlight-band">
        <div className="highlight-intro">
          <span className="eyebrow">{t("highlight2.eyebrow")}</span>
          <h2>{t("highlight2.title")}</h2>
        </div>
        <div className="highlight-grid">
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">01</span><span className="highlight-tag">{t("highlight2.1.tag")}</span></div>
            <h3>{t("highlight2.1.title")}</h3>
            <p>{t("highlight2.1.desc")}</p>
            <div className="highlight-stat">{t("highlight2.1.stat")}</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">02</span><span className="highlight-tag">{t("highlight2.2.tag")}</span></div>
            <h3>{t("highlight2.2.title")}</h3>
            <p>{t("highlight2.2.desc")}</p>
            <div className="highlight-stat">{t("highlight2.2.stat")}</div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">03</span><span className="highlight-tag">{t("highlight2.3.tag")}</span></div>
            <h3>{t("highlight2.3.title")}</h3>
            <p>{t("highlight2.3.desc")}</p>
            <div className="highlight-stat"><a href="/legal/confidentialite" style={{ color: "inherit" }}>{t("highlight2.3.stat")}</a></div>
          </div>
          <div className="highlight-item">
            <div className="highlight-item-top"><span className="highlight-icon">04</span><span className="highlight-tag">{t("highlight2.4.tag")}</span></div>
            <h3>{t("highlight2.4.title")}</h3>
            <p>{t("highlight2.4.desc")}</p>
            <div className="highlight-stat">{t("highlight2.4.stat")}</div>
          </div>
        </div>
      </section>

      <section className="cta-band">
        <h2>{t("ctaBand.title")}</h2>
        <a className="nav-cta" href="/analyze">{t("nav.cta")}</a>
        <div className="trial-note trial-note-light">{t("ctaBand.note")}</div>
      </section>

      <footer className="footer"><span>{t("footer.tagline")}</span><span className="footer-links"><a href="/legal/mentions-legales">{t("footer.mentions")}</a><a href="/legal/cgu">{t("footer.cgu")}</a><a href="/legal/confidentialite">{t("footer.confidentialite")}</a></span></footer>
    </main>
  );
}
