import Link from "next/link";

export type SpaceTab = "overview" | "project" | "progress" | "alerts" | "team" | "export";

const TABS: { key: SpaceTab; href: string; label: string }[] = [
  { key: "overview", href: "/espace", label: "Vue d'ensemble" },
  { key: "project", href: "/projet", label: "Mon projet" },
  { key: "progress", href: "/progress", label: "Progression" },
  { key: "alerts", href: "/alerts", label: "Alertes" },
  { key: "team", href: "/team", label: "Équipe" },
  { key: "export", href: "/export", label: "Export" },
];

export const SPACE_TABS = TABS.map((t) => t.key);

// « Mon espace » : Progression, Alertes, Équipe et Export réunis au même endroit,
// avec des onglets en haut de chacune de ces rubriques.
export function SpaceTabs({ active }: { active: SpaceTab }) {
  return (
    <div className="space-tabs-wrap">
      <span className="space-tabs-title">Mon espace</span>
      <nav className="space-tabs" aria-label="Mon espace">
        {TABS.map((t) => (
          <Link key={t.key} href={t.href} className={"space-tab" + (t.key === active ? " space-tab-active" : "")} aria-current={t.key === active ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
