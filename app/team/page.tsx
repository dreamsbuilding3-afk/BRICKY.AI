"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase/client";
import { AppNav } from "../../components/AppNav";

type Member = {
  id: string;
  invite_email: string;
  status: "pending" | "active" | "revoked";
  created_at: string;
};

type Membership = {
  id: string;
  owner_id: string;
  status: string;
};

export default function TeamPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState("");
  const [canInvite, setCanInvite] = useState(false);
  const [checkingPlan, setCheckingPlan] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  async function refreshTeam() {
    const { data } = await supabase
      .from("agency_members")
      .select("id, invite_email, status, created_at")
      .order("created_at", { ascending: false });
    setMembers((data as Member[]) || []);
  }

  async function refreshMemberships() {
    const { data } = await supabase
      .from("agency_members")
      .select("id, owner_id, status")
      .eq("status", "active");
    setMemberships((data as Membership[]) || []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }
      if (cancelled) return;
      setUserEmail(sessionData.session.user.email ?? "");

      await supabase.rpc("accept_pending_agency_invites");

      const { data: sub } = await supabase.rpc("get_my_subscription");
      const allowed = Boolean(
        sub && typeof sub === "object" && "multi_user" in sub && (sub as { multi_user: boolean }).multi_user,
      );
      if (cancelled) return;
      setCanInvite(allowed);
      setCheckingPlan(false);

      await refreshMemberships();
      if (allowed) await refreshTeam();
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  async function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviting(true);
    setError("");
    setMessage("");
    try {
      const { error: rpcError } = await supabase.rpc("invite_agency_member", { p_email: inviteEmail });
      if (rpcError) throw rpcError;
      setMessage(`Invitation envoyée à ${inviteEmail}.`);
      setInviteEmail("");
      await refreshTeam();
    } catch (err: any) {
      const msg = err?.message || "";
      if (msg.includes("multi_user_not_included_in_plan")) setError("Les comptes multi-utilisateurs sont réservés à l'offre Agence.");
      else if (msg.includes("member_limit_reached")) setError("Vous avez atteint la limite de 10 membres.");
      else if (msg.includes("cannot_invite_self")) setError("Vous ne pouvez pas vous inviter vous-même.");
      else if (msg.includes("invalid_email")) setError("Adresse email invalide.");
      else setError("Impossible d'envoyer cette invitation.");
    } finally {
      setInviting(false);
    }
  }

  async function handleRemove(id: string) {
    setMembers((current) => current.filter((m) => m.id !== id));
    await supabase.rpc("remove_agency_member", { p_id: id });
  }

  async function handleLeave(ownerId: string) {
    setMemberships((current) => current.filter((m) => m.owner_id !== ownerId));
    await supabase.rpc("leave_agency_team", { p_owner_id: ownerId });
  }

  return (
    <main className="page">
      <AppNav email={userEmail} active="team" />
      <section className="analysis-shell">
        <div className="analysis-intro">
          <span className="eyebrow">Bricky · Équipe</span>
          <h1>Comptes multi-utilisateurs</h1>
          <p className="sub">Partagez l&apos;accès à votre portefeuille de biens et à vos analyses avec votre équipe.</p>
        </div>

        {checkingPlan && <div className="extract-note">Vérification de votre abonnement…</div>}

        {!checkingPlan && !canInvite && (
          <div className="result-panel" style={{ textAlign: "center" }}>
            <span className="eyebrow">Fonctionnalité Agence</span>
            <h2 style={{ margin: "14px 0 8px" }}>Les comptes multi-utilisateurs sont réservés au palier Agence</h2>
            <p className="empty-note" style={{ maxWidth: 480, margin: "0 auto 28px" }}>
              Passez au palier Agence pour inviter vos collègues à consulter et gérer votre portefeuille de biens.
            </p>
            <a
              href="/pricing"
              className="primary-button"
              style={{ display: "inline-flex", width: "auto", padding: "0 28px", textDecoration: "none", alignItems: "center", justifyContent: "center", minHeight: 54 }}
            >
              Voir les abonnements →
            </a>
          </div>
        )}

        {!checkingPlan && canInvite && (
          <>
            <form className="property-form" onSubmit={handleInvite}>
              <div className="form-grid">
                <label>
                  Email du collègue à inviter
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="collegue@monagence.fr"
                  />
                </label>
              </div>
              <button className="primary-button" disabled={inviting}>
                {inviting ? "Envoi…" : "Inviter →"}
              </button>
              {error && <div className="error-box">{error}</div>}
              {message && <p className="empty-note" style={{ marginTop: 12 }}>{message}</p>}
            </form>

            {loading && <div className="extract-note">Chargement de votre équipe…</div>}

            {!loading && members.length > 0 && (
              <div className="dashboard-section">
                <h3>Membres de l&apos;équipe ({members.length})</h3>
                <div className="checklist-list">
                  {members.map((m) => (
                    <div className="checklist-item" key={m.id} style={{ cursor: "default" }}>
                      <div style={{ flex: 1 }}>
                        <b>{m.invite_email}</b>
                        <p>{m.status === "active" ? "Actif" : m.status === "pending" ? "Invitation en attente" : "Révoqué"}</p>
                      </div>
                      <button type="button" className="secondary-button" onClick={() => handleRemove(m.id)}>
                        Retirer
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!loading && members.length === 0 && (
              <p className="empty-note" style={{ marginTop: 24 }}>
                Vous n&apos;avez pas encore invité de collègue. Ajoutez une adresse email ci-dessus pour partager l&apos;accès à votre portefeuille.
              </p>
            )}
          </>
        )}

        {!loading && memberships.length > 0 && (
          <div className="dashboard-section">
            <h3>Équipes que vous avez rejointes</h3>
            <div className="checklist-list">
              {memberships.map((m) => (
                <div className="checklist-item" key={m.id} style={{ cursor: "default" }}>
                  <div style={{ flex: 1 }}>
                    <b>Accès partagé à un portefeuille d&apos;agence</b>
                  </div>
                  <button type="button" className="secondary-button" onClick={() => handleLeave(m.owner_id)}>
                    Quitter
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
