"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase/client";

type AppNavProps = {
  email?: string | null;
  active?: "analyze" | "properties" | "account" | "alerts" | "team" | "export";
};

export function AppNav({ email, active }: AppNavProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <nav className="nav nav-has-burger">
      <div className="brand">
        <span className="mark">B</span>Bricky
      </div>
      <button
        type="button"
        className={"nav-burger" + (menuOpen ? " nav-burger-open" : "")}
        aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((open) => !open)}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>
      <div className={"nav-links" + (menuOpen ? " nav-links-open" : "")}>
        <Link
          className={"navlink" + (active === "properties" ? " navlink-active" : "")}
          href="/properties"
          onClick={closeMenu}
        >
          Mes biens
        </Link>
        <Link
          className={"navlink" + (active === "analyze" ? " navlink-active" : "")}
          href="/analyze"
          onClick={closeMenu}
        >
          Nouvelle analyse
        </Link>
        <Link
          className={"navlink" + (active === "account" ? " navlink-active" : "")}
          href="/account"
          onClick={closeMenu}
        >
          {email || "Mon compte"}
        </Link>
        <Link
          className={"navlink" + (active === "alerts" ? " navlink-active" : "")}
          href="/alerts"
          onClick={closeMenu}
        >
          Alertes
        </Link>
        <Link
          className={"navlink" + (active === "team" ? " navlink-active" : "")}
          href="/team"
          onClick={closeMenu}
        >
          Équipe
        </Link>
        <Link
          className={"navlink" + (active === "export" ? " navlink-active" : "")}
          href="/export"
          onClick={closeMenu}
        >
          Export
        </Link>
        <Link className="navlink" href="/pricing" onClick={closeMenu}>
          Tarifs
        </Link>
        <button type="button" className="navlink navlink-logout" onClick={handleLogout}>
          Déconnexion
        </button>
      </div>
    </nav>
  );
}
