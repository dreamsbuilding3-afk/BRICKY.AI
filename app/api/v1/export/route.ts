import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const columns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((k) => set.add(k));
      return set;
    }, new Set<string>()),
  );
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const str = typeof value === "object" ? JSON.stringify(value) : String(value);
    if (/[",\n;]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => escape(row[c])).join(","));
  }
  return lines.join("\n");
}

export async function GET(request: NextRequest) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "api.export", maxRequests: 30, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;

  const url = new URL(request.url);
  const resource = (url.searchParams.get("resource") || "properties").toLowerCase();
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const authHeader = request.headers.get("authorization");
  const bearerKey = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const apiKey = bearerKey || url.searchParams.get("api_key");

  if (!apiKey) {
    return NextResponse.json(
      { error: "missing_api_key", message: "Fournissez votre clé API via l'en-tête Authorization: Bearer <clé> ou ?api_key=." },
      { status: 401 },
    );
  }

  if (resource !== "properties" && resource !== "analyses") {
    return NextResponse.json({ error: "invalid_resource", message: "resource doit valoir 'properties' ou 'analyses'." }, { status: 400 });
  }

  const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/export_my_data`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_api_key: apiKey, p_resource: resource }),
    cache: "no-store",
  });

  if (!rpcRes.ok) {
    let message = "Impossible d'exporter ces données.";
    let code = "export_failed";
    let status = 400;
    try {
      const errBody = await rpcRes.json();
      const raw = String(errBody?.message || "");
      if (raw.includes("invalid_api_key")) {
        code = "invalid_api_key";
        message = "Clé API invalide ou révoquée.";
        status = 401;
      } else if (raw.includes("api_export_not_included_in_plan")) {
        code = "api_export_not_included_in_plan";
        message = "L'export API/CSV est réservé à l'offre Agence.";
        status = 402;
      } else if (raw.includes("invalid_resource")) {
        code = "invalid_resource";
        message = "resource doit valoir 'properties' ou 'analyses'.";
        status = 400;
      }
    } catch {
      // ignore parse errors, fall back to generic message
    }
    return NextResponse.json({ error: code, message }, { status });
  }

  const rows = (await rpcRes.json()) as Record<string, unknown>[];

  if (format === "csv") {
    const csv = toCsv(Array.isArray(rows) ? rows : []);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bricky-${resource}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return NextResponse.json(rows, { headers: { "Cache-Control": "no-store" } });
}
