"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase/client";

type AppNavProps = {
  email?: string | null;
  active?: "analyze" | "properties" | "account";
};

export function AppNav({ email, active }: AppNavProps) {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <nav className="nav">
      <div className="brand">
        <span className="mark">B</span>Bricky
      </div>
      <div className="nav-links">
        <Link
          className={"navlink" + (active === "properties" ? " navlink-active" : "")}
          href="/properties"
        >
          Mes biens
        </Link>
        <Link
          className={"navlink" + (active === "analyze" ? " navlink-active" : "")}
          href="/analyze"
        >
          Nouvelle analyse
        </Link>
        <Link
          className={"navlink" + (active === "account" ? " navlink-active" : "")}
          href="/account"
        >
          {email || "Mon compte"}
        </Link>
        <button type="button" className="navlink navlink-logout" onClick={handleLogout}>
          Déconnexion
        </button>
      </div>
    </nav>
  );
}
