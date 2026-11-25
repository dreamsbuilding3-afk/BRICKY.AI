import Link from "next/link";
import "./biensTabs.css";

// Onglets en haut de « Mes biens » : la liste des biens et les dossiers générés par Bricky.
export function BiensTabs({ active, count }: { active: "biens" | "dossiers"; count?: number | null }) {
  return (
    <nav className="biens-tabs" aria-label="Mes biens">
      <Link href="/properties" className={"biens-tab" + (active === "biens" ? " is-active" : "")} aria-current={active === "biens" ? "page" : undefined}>
        Mes biens
      </Link>
      <Link href="/dossiers" className={"biens-tab" + (active === "dossiers" ? " is-active" : "")} aria-current={active === "dossiers" ? "page" : undefined}>
        Mes dossiers{count ? <span className="biens-tab-count">{count}</span> : null}
      </Link>
    </nav>
  );
}
