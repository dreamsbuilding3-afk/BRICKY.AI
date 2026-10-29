"use client";

import { useState, useEffect } from "react";
import { useLocale } from "../components/LocaleProvider";
import { BrickyIsland } from "../components/BrickyIsland";
import { ReviewsBoard } from "../components/ReviewsBoard";
import { ContainerShowcase } from "../components/ContainerShowcase";

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

// Section « Comment ça marche » : l'île 3D de la mascotte (vitrine avec des biens d'exemple)
// et les trois étapes qui flottent autour.
function IslandShowcase() {
  const { t } = useLocale();
  return (
    <section className="island-section" aria-labelledby="island-title">
      <div className="island-head">
        <span className="eyebrow">{t("steps.eyebrow")}</span>
        <h2 id="island-title" className="island-title">
          <span>{t("island.title.a")}</span> <em>{t("island.title.b")}</em>
        </h2>
      </div>
      <div className="island-scene">
        <BrickyIsland
          mode="demo"
          counts={{ villa: 1, appartement: 2, immeuble: 3 }}
          labelOverrides={{ appartement: { one: t("island.kind.penthouse.one"), many: t("island.kind.penthouse.many") } }}
          ariaLabel={t("island.aria")}
        />
        <ol className="island-steps">
          {[1, 2, 3].map((n) => (
            <li key={n} className={"island-step island-step-" + n}>
              <span className="island-step-n">{n}</span>
              <span className="island-step-text"><b>{t(`steps.${n}.title`)}</b><small>{t(`island.step.${n}`)}</small></span>
            </li>
          ))}
        </ol>
      </div>
      <div className="island-foot">
        <p className="island-sub">{t("island.sub")}</p>
        <a className="primary-button island-cta" href="/analyze">
          {t("island.cta")}
          <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
      </div>
    </section>
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

      <IslandShowcase />

      <ReviewsBoard />

      <ContainerShowcase />

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
