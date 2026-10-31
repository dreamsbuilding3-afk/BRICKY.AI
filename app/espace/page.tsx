"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";
import { SpaceTabs } from "../../components/SpaceTabs";

type Subscription = { name?: string; monthly_analysis_quota?: number | null; lifetime_analysis_quota?: number | null; used_period?: number; used_lifetime?: number; can_set_alerts?: boolean };
type AlertLite = { id: string; label: string | null; city: string | null; active: boolean };
type MemberLite = { id: string; invite_email: string | null; status: string | null };

const MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

// « Mon espace » : Progression, Alertes, Équipe et Export réunis sur une seule
// page en grille « bento », chaque carte menant à la rubrique complète.
export default function EspacePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [months, setMonths] = useState<{ label: string; count: number }[]>([]);
  const [avgScore, setAvgScore] = useState<number | null>(null);
  const [totalAnalyses, setTotalAnalyses] = useState<number | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [alerts, setAlerts] = useState<AlertLite[]>([]);
  const [members, setMembers] = useState<MemberLite[]>([]);
  const [apiKeys, setApiKeys] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setEmail(data.session.user.email ?? "");

      const [analyses, subscription, team, keys] = await Promise.all([
        supabase.from("analyses").select("created_at, overall_score").order("created_at", { ascending: false }).limit(500),
        supabase.rpc("get_my_subscription"),
        supabase.from("agency_members").select("id, invite_email, status").order("created_at", { ascending: false }).limit(4),
        supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("revoked", false),
      ]);
      if (cancelled) return;

      // Analyses par mois sur les 6 derniers mois.
      const rows = (analyses.data as { created_at: string; overall_score: number | null }[]) || [];
      const now = new Date();
      const buckets = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
        return { key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS[d.getMonth()], count: 0 };
      });
      for (const r of rows) {
        const d = new Date(r.created_at);
        const b = buckets.find((x) => x.key === `${d.getFullYear()}-${d.getMonth()}`);
        if (b) b.count += 1;
      }
      setMonths(buckets.map(({ label, count }) => ({ label, count })));
      setTotalAnalyses(rows.length);
      const scores = rows.map((r) => r.overall_score).filter((s): s is number => typeof s === "number");
      setAvgScore(scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null);

      const s = (subscription.data as Subscription) || null;
      setSub(s);
      setMembers((team.data as MemberLite[]) || []);
      setApiKeys(keys.count ?? 0);
      if (s?.can_set_alerts) {
        const { data: a } = await supabase.from("alert_criteria").select("id, label, city, active").order("created_at", { ascending: false }).limit(3);
        if (!cancelled) setAlerts((a as AlertLite[]) || []);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  const maxMonth = Math.max(1, ...months.map((m) => m.count));
  const quota = sub?.monthly_analysis_quota ?? sub?.lifetime_analysis_quota ?? null;
  const used = sub?.monthly_analysis_quota != null ? sub?.used_period ?? 0 : sub?.used_lifetime ?? 0;
  const quotaPct = quota ? Math.min(100, Math.round((used / quota) * 100)) : null;
  const activeAlerts = alerts.filter((a) => a.active).length;

  return (
    <main className="page">
      <AppNav email={email} active="space" />
      <section className="analysis-shell espace-shell">
        <SpaceTabs active="overview" />
        <div className="analysis-intro">
          <span className="eyebrow">Vue d'ensemble</span>
          <h1>Tout ton suivi, <span className="espace-accent">au même endroit.</span></h1>
          <p className="sub">Progression, alertes, équipe et export : un coup d'œil ici, un clic pour aller plus loin.</p>
        </div>

        <div className="espace-grid">
          {/* Progression */}
          <Link href="/progress" className="espace-card espace-span-4 espace-tall">
            <div className="espace-card-top">
              <span className="espace-kicker">Progression</span>
              <span className="espace-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="espace-stats">
              <div><b>{totalAnalyses ?? "—"}</b><span>analyses</span></div>
              <div><b>{avgScore ?? "—"}</b><span>score moyen</span></div>
              {quota ? <div><b>{used}/{quota}</b><span>{sub?.monthly_analysis_quota != null ? "ce mois-ci" : "au total"}</span></div> : null}
            </div>
            <div className="espace-bars" aria-hidden="true">
              {(months.length ? months : MONTHS.slice(0, 6).map((label) => ({ label, count: 0 }))).map((m, i, arr) => (
                <div key={i} className="espace-bar-col">
                  <span className={"espace-bar" + (i === arr.length - 1 ? " espace-bar-now" : "")} style={{ height: `${Math.max(6, (m.count / maxMonth) * 100)}%` }} />
                  <small>{m.label}</small>
                </div>
              ))}
            </div>
            {quotaPct !== null && (
              <div className="espace-quota" aria-label={`Quota utilisé : ${quotaPct} %`}>
                <span style={{ width: `${quotaPct}%` }} />
              </div>
            )}
          </Link>

          {/* Alertes */}
          <Link href="/alerts" className="espace-card espace-span-2 espace-tall">
            <div className="espace-card-top">
              <span className="espace-kicker">Alertes</span>
              <span className="espace-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="espace-notifs" aria-hidden="true">
              {(alerts.length ? alerts : [null, null, null]).slice(0, 3).map((a, i) => (
                <div key={i} className={"espace-notif" + (a ? "" : " espace-notif-ghost") + (a && !a.active ? " espace-notif-off" : "")}>
                  <span className="espace-notif-dot" />
                  <span>{a ? a.label || a.city || "Alerte" : ["Nouvelle annonce", "Baisse de prix", "Bien correspondant"][i]}</span>
                </div>
              ))}
            </div>
            <h2>{alerts.length ? `${activeAlerts} alerte${activeAlerts > 1 ? "s" : ""} active${activeAlerts > 1 ? "s" : ""}` : "Surveille le marché"}</h2>
            <p>Sois prévenu dès qu'une annonce correspond à tes critères.</p>
          </Link>

          {/* Équipe */}
          <Link href="/team" className="espace-card espace-span-3">
            <div className="espace-card-top">
              <span className="espace-kicker">Équipe</span>
              <span className="espace-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="espace-avatars" aria-hidden="true">
              <span className="espace-avatar espace-avatar-me">{(email[0] || "B").toUpperCase()}</span>
              {members.slice(0, 3).map((m) => (
                <span key={m.id} className="espace-avatar">{(m.invite_email?.[0] || "?").toUpperCase()}</span>
              ))}
              <span className="espace-avatar espace-avatar-add">+</span>
            </div>
            <h2>{members.length ? `${members.length} membre${members.length > 1 ? "s" : ""} invité${members.length > 1 ? "s" : ""}` : "Travaille à plusieurs"}</h2>
            <p>Partage tes analyses avec tes associés ou ton agence.</p>
          </Link>

          {/* Export */}
          <Link href="/export" className="espace-card espace-span-3">
            <div className="espace-card-top">
              <span className="espace-kicker">Export</span>
              <span className="espace-arrow" aria-hidden="true">↗</span>
            </div>
            <div className="espace-files" aria-hidden="true">
              <span className="espace-file">CSV</span>
              <span className="espace-file espace-file-alt">API</span>
              <span className="espace-file espace-file-ghost">PDF</span>
            </div>
            <h2>{apiKeys ? `${apiKeys} clé${apiKeys > 1 ? "s" : ""} API active${apiKeys > 1 ? "s" : ""}` : "Récupère tes données"}</h2>
            <p>Exporte tes biens en CSV ou connecte tes outils via l'API.</p>
          </Link>
        </div>

        <div className="espace-chips">
          <Link className="espace-chip" href="/projet"><span className="espace-chip-dot" />Mon projet</Link>
          <Link className="espace-chip" href="/account"><span className="espace-chip-dot" />Mon compte</Link>
          <Link className="espace-chip" href="/pricing"><span className="espace-chip-dot" />{sub?.name ? `Abonnement : ${sub.name}` : "Abonnements"}</Link>
          <Link className="espace-chip" href="/bouton"><span className="espace-chip-dot" />Bouton « Envoyer à Bricky »</Link>
          <Link className="espace-chip" href="/blog"><span className="espace-chip-dot" />Guides</Link>
        </div>
      </section>
    </main>
  );
}
