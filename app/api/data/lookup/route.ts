import { NextResponse } from "next/server";
import { collectPropertyData } from "@/lib/data";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rateLimitResponse = await enforceRateLimit(request, { endpoint: "data.lookup", maxRequests: 20, windowSeconds: 60 });
  if (rateLimitResponse) return rateLimitResponse;
  const authResponse = await requireUser(request);
  if (authResponse) return authResponse;

  try {
    const body = (await request.json()) as {
      address?: string;
      postalCode?: string;
      surfaceM2?: number;
      propertyType?: string;
    };

    const address = body.address?.trim();
    if (!address) {
      return NextResponse.json({ error: "address is required" }, { status: 400 });
    }

    const data = await collectPropertyData({
      address,
      postalCode: body.postalCode?.trim(),
      surfaceM2: typeof body.surfaceM2 === "number" ? body.surfaceM2 : undefined,
      propertyType: body.propertyType?.trim(),
    });

    return NextResponse.json(data, {
      headers: { "cache-control": "private, max-age=300" },
    });
  } catch (error) {
    console.error("[data.lookup]", error);
    return NextResponse.json({ error: "Données indisponibles pour le moment, réessaie." }, { status: 500 });
  }
}
