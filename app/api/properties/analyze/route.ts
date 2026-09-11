import { NextResponse } from "next/server";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request: Request) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase environment variables are not configured." }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Property payload must be an object." }, { status: 400 });
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ingest_property`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: authorization,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({ p_payload: payload }),
    cache: "no-store",
  });

  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    return NextResponse.json(
      { error: "Property analysis failed.", details: data },
      { status: response.status >= 400 && response.status < 600 ? response.status : 502 },
    );
  }

  return NextResponse.json(data, { status: 200 });
}
