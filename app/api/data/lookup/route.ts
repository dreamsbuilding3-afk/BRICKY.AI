import { NextResponse } from "next/server";
import { collectPropertyData } from "@/lib/data";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireUser } from "@/lib/auth/requireUser";

export const runtime = "nodejs";

export async function POST(request: Request) {
  // Route réservée aux comptes connectés et limitée : sans ça, n'importe qui
  // pourrait s'en servir comme relais gratuit vers les API publiques, à nos frais.
  const limited = await enforceRateLimit(request, { endpoint: "data.lookup", maxRequests: 20, windowSeconds: 60 });
  if (limited) return limited;
  const unauthorized = await requireUser(request);
  if (unauthorized) return unauthorized;
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected data pipeline error" },
      { status: 500 },
    );
  }
}
