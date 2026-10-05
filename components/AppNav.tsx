"use client";

import { useEffect, useRef, useState } from "react";
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
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function closeMenu() {
    setMenuOpen(false);
    setAccountMenuOpen(false);
  }

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <nav className="nav nav-has-burger">
      <Link href="/properties" className="brand" onClick={closeMenu}>
        <img src="/mascot-avatar-round.png" alt="" className="brand-avatar" />
        <span>Bricky</span>
      </Link>
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
        <div className="navlink-account-wrap" ref={accountMenuRef}>
          <button
            type="button"
            className={"navlink navlink-account-trigger" + (active === "account" ? " navlink-active" : "")}
            onClick={() => setAccountMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
          >
            <span className="navlink-account-label">{email || "Compte"}</span>
            <svg
              className="navlink-account-chevron"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {accountMenuOpen ? (
            <div className="navlink-account-menu" role="menu">
              <Link
                className="navlink-account-menu-item"
                href="/account"
                role="menuitem"
                onClick={closeMenu}
              >
                Mon compte
              </Link>
              <button
                type="button"
                className="navlink-account-menu-item navlink-account-menu-logout"
                role="menuitem"
                onClick={handleLogout}
              >
                Déconnexion
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
