export type Confidence = "high" | "medium" | "low" | "none";

export type GeoResult = {
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  postalCode?: string;
  inseeCode?: string;
  banId?: string;
  score?: number;
  confidence: Confidence;
  raw?: unknown;
};

export type ComparableSale = {
  source: "DVF+";
  transactionDate?: string;
  address?: string;
  city?: string;
  surfaceM2?: number;
  price?: number;
  priceM2?: number;
  distanceM?: number;
  rawPayload?: unknown;
};

export type DpeResult = {
  source: "ADEME_DPE";
  dpeId?: string;
  dpeClass?: string;
  gesClass?: string;
  surfaceM2?: number;
  constructionYear?: number;
  diagnosticDate?: string;
  address?: string;
  confidence: Confidence;
  raw?: unknown;
};

export type RiskResult = {
  source: "GEORISQUES";
  code?: string;
  label: string;
  severity: "low" | "medium" | "high" | "unknown";
  explanation?: string;
  raw?: unknown;
};

export type DataSourceStatus = {
  source: string;
  ok: boolean;
  retrievedAt: string;
  error?: string;
};

export type PropertyDataBundle = {
  geocode?: GeoResult;
  comparables: ComparableSale[];
  dpe?: DpeResult;
  risks: RiskResult[];
  sources: DataSourceStatus[];
};
