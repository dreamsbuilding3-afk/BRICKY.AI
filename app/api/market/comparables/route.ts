import { NextRequest, NextResponse } from "next/server";

const DVF_API = "https://api.cquest.org/dvf";

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const lat = num(body?.latitude);
    const lon = num(body?.longitude);
    const radius = Math.min(Math.max(num(body?.radius_m) ?? 500, 100), 2000);

    if (lat === null || lon === null) {
      return NextResponse.json({
        error: "latitude et longitude sont requises pour rechercher des comparables.",
      }, { status: 400 });
    }

    const url = new URL(DVF_API);
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("dist", String(radius));

    const response = await fetch(url, {
      headers: { "User-Agent": "Bricky.AI/1.0" },
      signal: AbortSignal.timeout(10000),
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({
        error: `La source DVF n'est pas accessible (${response.status}).`,
      }, { status: 422 });
    }

    const raw = await response.json();
    const rows = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];

    const comparables = rows.map((row: Record<string, unknown>) => {
      const surface = num(row.surface_reelle_bati ?? row.surface_bati ?? row.surface);
      const price = num(row.valeur_fonciere ?? row.prix);
      return {
        source: "DVF",
        transaction_date: row.date_mutation ?? row.date,
        address: row.adresse_nom_voie ?? row.adresse ?? null,
        city: row.nom_commune ?? row.commune ?? null,
        surface_m2: surface,
        price,
        price_m2: surface && price ? Math.round((price / surface) * 100) / 100 : null,
        distance_m: num(row.distance),
        raw_payload: row,
      };
    }).filter((row) => row.surface_m2 && row.price && row.price_m2);

    return NextResponse.json({
      source: "DVF",
      source_url: DVF_API,
      status: comparables.length ? "ready" : "insufficient_data",
      count: comparables.length,
      comparables,
      note: "Les transactions DVF sont des ventes enregistrées, pas des prix d'annonces. Elles servent de référence de marché et doivent être interprétées avec leur date et leurs caractéristiques.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de récupérer les comparables.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
