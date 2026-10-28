"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { PropertyIllustration } from "../../components/PropertyIllustration";

type AnalysisLite = { verdict: string | null; overall_score: number | null; created_at: string };
type PropertyLite = { id: string; title: string | null; property_type: string | null; created_at: string; analyses: AnalysisLite[] | null };
type Subscription = { name?: string; plan_code?: string; monthly_analysis_quota?: number | null; lifetime_analysis_quota?: number | null; used_period?: number; used_lifetime?: number; can_set_alerts?: boolean };
type AlertLite = { id: string; label: string | null; city: string | null; active: boolean };

function latest(p: PropertyLite): AnalysisLite | null {
  const list = (p.analyses || []).slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return list[0] ?? null;
}

const VERDICT_COLOR: Record<string, string> = { interesting: "#4ade80", to_review: "#ff8a4d", unattractive: "#f87171" };

// Accueil : toutes les rubriques de Bricky réunies sur une seule page (grille
// « bento »), chaque carte menant à la partie concernée.
export default function AccueilPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [properties, setProperties] = useState<PropertyLite[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [alerts, setAlerts] = useState<AlertLite[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? "");
      const [props, subscription] = await Promise.all([
        supabase.from("properties").select("id, title, property_type, created_at, analyses(verdict, overall_score, created_at)").order("created_at", { ascending: false }).limit(12),
        supabase.rpc("get_my_subscription"),
      ]);
      if (cancelled) return;
      setProperties((props.data as PropertyLite[]) || []);
      const s = (subscription.data as Subscription) || null;
      setSub(s);
      if (s?.can_set_alerts) {
        const { data: a } = await supabase.from("alert_criteria").select("id, label, city, active").order("created_at", { ascending: false }).limit(3);
        if (!cancelled) setAlerts((a as AlertLite[]) || []);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [router]);

  const scored = properties.map((p) => ({ p, a: latest(p) })).filter((x) => x.a?.overall_score != null).slice(0, 10).reverse();
  const quota = sub?.monthly_analysis_quota ?? sub?.lifetime_analysis_quota ?? null;
  const used = sub?.monthly_analysis_quota != null ? sub?.used_period ?? 0 : sub?.used_lifetime ?? 0;
  const firstName = email ? email.split("@")[0].split(/[._-]/)[0] : "";
  const lastProperty = properties[0];

  return (
    <main className="page">
      <AppNav email={email} active="home" />
      <section className="hub-shell">
        <div className="hub-intro">
          <span className="eyebrow">Bricky</span>
          <h1>{firstName ? `Bonjour ${firstName.charAt(0).toUpperCase() + firstName.slice(1)}.` : "Bonjour."} Tout Bricky, au même endroit.</h1>
          <p className="sub">Choisis ce que tu veux faire, Bricky t'y emmène.</p>
        </div>

        <div className="hub-panel">
          <div className="hub-grid">
            {/* Nouvelle analyse */}
            <div className="hub-card hub-span-3 hub-tall hub-analyze">
              <div className="hub-analyze-visual" aria-hidden="true">
                <PropertyIllustration propertyType="maison" className="hub-illu hub-illu-back" />
                <PropertyIllustration propertyType="immeuble" className="hub-illu hub-illu-front" />
              </div>
              <h2>Nouvelle analyse</h2>
              <p>Colle une annonce : Bricky remplit tout et te donne un verdict en quelques secondes.</p>
              <div className="hub-actions">
                <Link className="hub-btn hub-btn-primary" href="/analyze?mode=achat">Acheter un bien →</Link>
                <Link className="hub-btn" href="/analyze?mode=location">Louer un logement →</Link>
              </div>
            </div>

            {/* Mes biens */}
            <Link className="hub-card hub-span-3 hub-tall" href="/properties">
              <div className="hub-chart" aria-hidden="true">
                <div className="hub-chart-head"><span className="hub-chart-title">Scores</span><span className="hub-chart-meta">{loaded ? `${properties.length >= 12 ? "12+" : properties.length} bien${properties.length > 1 ? "s" : ""}` : "…"}</span></div>
                <div className="hub-bars">
                  {(scored.length ? scored : Array.from({ length: 10 }, () => null)).map((x, i) => (
                    <span
                      key={i}
                      className={x ? "hub-bar" : "hub-bar hub-bar-ghost"}
                      style={{ height: `${x ? Math.max(12, Number(x.a!.overall_score)) : 20 + ((i * 37) % 60)}%`, background: x ? VERDICT_COLOR[x.a!.verdict ?? ""] ?? "#ff8a4d" : undefined }}
                      title={x ? `${x.p.title ?? "Bien"} : ${x.a!.overall_score}/100` : undefined}
                    />
                  ))}
                </div>
              </div>
              <h2>Mes biens</h2>
              <p>{lastProperty ? `Dernier : ${(lastProperty.title ?? "bien sans titre").replace(/&amp;euro;|&euro;/g, "€").slice(0, 60)}` : "Retrouve toutes tes analyses enregistrées."}</p>
              <span className="hub-link">Voir mes biens →</span>
            </Link>

            {/* Alertes */}
            <Link className="hub-card hub-span-2" href="/alerts">
              <div className="hub-notifs" aria-hidden="true">
                {(alerts.length ? alerts.slice(0, 2) : [null, null]).map((a, i) => (
                  <div key={i} className={a ? "hub-notif" : "hub-notif hub-notif-ghost"}>
                    <span className="hub-notif-dot" />
                    <span>{a ? a.label || a.city || "Alerte" : i === 0 ? "Nouvelle annonce" : "Baisse de prix"}</span>
                  </div>
                ))}
              </div>
              <h2>Alertes</h2>
              <p>{alerts.length ? `${alerts.filter((a) => a.active).length} alerte${alerts.length > 1 ? "s" : ""} active${alerts.length > 1 ? "s" : ""}.` : "Sois prévenu des nouvelles annonces qui te correspondent."}</p>
            </Link>

            {/* Comparer */}
            <Link className="hub-card hub-span-2" href="/properties">
              <div className="hub-compare" aria-hidden="true">
                <div><span style={{ height: "70%" }} /><span style={{ height: "45%" }} /><span style={{ height: "85%" }} /></div>
                <b>VS</b>
                <div><span style={{ height: "55%" }} /><span style={{ height: "80%" }} /><span style={{ height: "40%" }} /></div>
              </div>
              <h2>Comparer</h2>
              <p>Coche deux biens dans « Mes biens » pour les mettre côte à côte.</p>
            </Link>

            {/* Progression */}
            <Link className="hub-card hub-span-2 hub-progress" href="/progress">
              <svg className="hub-curve" viewBox="0 0 200 70" aria-hidden="true">
                <defs>
                  <linearGradient id="hubCurveFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#ff5a1f" stopOpacity=".35" /><stop offset="1" stopColor="#ff5a1f" stopOpacity="0" /></linearGradient>
                </defs>
                <path d="M0 62 C 40 60, 60 52, 90 44 S 140 30, 160 18 S 190 6, 200 4 L 200 70 L 0 70 Z" fill="url(#hubCurveFill)" />
                <path d="M0 62 C 40 60, 60 52, 90 44 S 140 30, 160 18 S 190 6, 200 4" fill="none" stroke="#ff8a4d" strokeWidth="2.5" strokeLinecap="round" />
                <circle cx="160" cy="18" r="5" fill="#ff5a1f" className="hub-curve-dot" />
              </svg>
              <h2>Progression</h2>
              <p>{sub ? `${used} analyse${used > 1 ? "s" : ""}${quota ? ` sur ${quota}` : ""}${sub.monthly_analysis_quota != null ? " ce mois-ci" : ""}.` : "Suis ton parcours d'investisseur."}</p>
            </Link>

            {/* Bouton Bricky */}
            <Link className="hub-card hub-span-3 hub-row" href="/bouton">
              <div>
                <h2>Bouton « Envoyer à Bricky »</h2>
                <p>Un clic depuis Leboncoin, SeLoger ou PAP, et l'analyse se remplit toute seule.</p>
              </div>
              <div className="hub-bookmark" aria-hidden="true">
                <img src="/mascot-avatar-round.png" alt="" />
                <span>Envoyer à Bricky</span>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff"><path d="M5 3l14 8-6 1.5L16 20l-3 1-3-7.5L5 17z" /></svg>
              </div>
            </Link>

            {/* Équipe */}
            <Link className="hub-card hub-span-3 hub-row" href="/team">
              <div>
                <h2>Équipe</h2>
                <p>Invite tes associés ou ton agence à partager les analyses.</p>
              </div>
              <div className="hub-avatars" aria-hidden="true">
                <span className="hub-avatar hub-avatar-me">{(email[0] || "B").toUpperCase()}</span>
                <span className="hub-avatar hub-avatar-add">+</span>
                <span className="hub-avatar hub-avatar-add">+</span>
              </div>
            </Link>
          </div>

          <div className="hub-chips">
            <Link className="hub-chip" href="/export"><span className="hub-chip-dot" />Export CSV &amp; API</Link>
            <Link className="hub-chip" href="/account"><span className="hub-chip-dot" />Mon compte</Link>
            <Link className="hub-chip" href="/pricing"><span className="hub-chip-dot" />{sub?.name ? `Abonnement : ${sub.name}` : "Abonnements"}</Link>
            <Link className="hub-chip" href="/blog"><span className="hub-chip-dot" />Guides & blog</Link>
            <Link className="hub-chip" href="/legal/confidentialite"><span className="hub-chip-dot" />Confidentialité</Link>
            <Link className="hub-chip" href="/legal/cgu"><span className="hub-chip-dot" />CGU</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
