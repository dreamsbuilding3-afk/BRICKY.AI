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
  propertyType?: string;
  rawPayload?: unknown;
};

export type DvfMarketStats = {
  source: "DVF+";
  comparableCount: number;
  medianPriceM2?: number;
  averagePriceM2?: number;
  minPriceM2?: number;
  maxPriceM2?: number;
  p25PriceM2?: number;
  p75PriceM2?: number;
  estimatedMarketValue?: number;
  valueLow?: number;
  valueHigh?: number;
  methodology: string;
  confidence: Confidence;
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
  matchScore?: number;
  matchQuality?: "exact" | "strong" | "approximate";
  dataQuality?: "complete" | "partial" | "limited";
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
  market?: DvfMarketStats;
  dpe?: DpeResult;
  risks: RiskResult[];
  sources: DataSourceStatus[];
};
