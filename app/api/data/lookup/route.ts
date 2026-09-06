import { NextResponse } from "next/server";
import { collectPropertyData } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(request: Request) {
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
