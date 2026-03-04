// Pyth Oracle price feeds via Hermes REST API
// No SDK dependency -- uses native fetch + 30s local cache

import { getConfig, isInitialized } from "../config.js";

export interface PriceData {
  price: number;
  confidence: number;
  timestamp: number; // unix ms
  source: string;
}

// Well-known Pyth feed IDs -- mainnet & testnet use different IDs
export const FEED_IDS: Record<string, Record<string, string>> = {
  "SUI/USD": {
    mainnet:
      "0x23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
    testnet:
      "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
    devnet:
      "0x50c67b3fd225db8912a424dd4baed60ffdde625ed2feaaf283724f9608fea266",
  },
};

// Hermes endpoints per network
const HERMES_ENDPOINTS: Record<string, string> = {
  mainnet: "https://hermes.pyth.network",
  testnet: "https://hermes-beta.pyth.network",
  devnet: "https://hermes-beta.pyth.network",
};

// ---------- Cache ----------

interface CacheEntry {
  data: PriceData;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;
const priceCache = new Map<string, CacheEntry>();

// ---------- Internal types matching Hermes v2 response ----------

interface HermesPrice {
  price: string;
  conf: string;
  expo: number;
  publish_time: number;
}

interface HermesParsed {
  id: string;
  price: HermesPrice;
}

interface HermesResponse {
  parsed: HermesParsed[];
}

// ---------- Helpers ----------

function resolveNetwork(network?: string): string {
  if (network) return network;
  // Try SDK config first (set via initSuistody), then env fallback
  if (isInitialized()) {
    return getConfig().network;
  }
  const envNet =
    typeof process !== "undefined" ? process.env?.SUI_NETWORK : undefined;
  return envNet ?? "testnet";
}

function getHermesBaseUrl(network?: string): string {
  const net = resolveNetwork(network);
  return HERMES_ENDPOINTS[net] ?? HERMES_ENDPOINTS.testnet;
}

function parsePythPrice(raw: HermesPrice): {
  price: number;
  confidence: number;
} {
  const factor = Math.pow(10, raw.expo);
  return {
    price: Number(raw.price) * factor,
    confidence: Number(raw.conf) * factor,
  };
}

// ---------- Public API ----------

export interface GetTokenPriceOptions {
  network?: string;
}

export async function getTokenPrice(
  feedId: string,
  options?: GetTokenPriceOptions
): Promise<PriceData> {
  const now = Date.now();
  const cached = priceCache.get(feedId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const baseUrl = getHermesBaseUrl(options?.network);
  const url = `${baseUrl}/v2/updates/price/latest?ids[]=${feedId}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Pyth Hermes API error: ${response.status} ${response.statusText}`
    );
  }

  const json = (await response.json()) as HermesResponse;

  if (!json.parsed || json.parsed.length === 0) {
    throw new Error(`No price data for feed: ${feedId}`);
  }

  const parsed = json.parsed[0];
  const { price, confidence } = parsePythPrice(parsed.price);

  const data: PriceData = {
    price,
    confidence,
    timestamp: parsed.price.publish_time * 1000,
    source: "pyth",
  };

  priceCache.set(feedId, { data, expiresAt: now + CACHE_TTL_MS });

  return data;
}

export async function getSuiUsdPrice(
  options?: GetTokenPriceOptions
): Promise<PriceData> {
  const net = resolveNetwork(options?.network);
  const feedMap = FEED_IDS["SUI/USD"];
  const feedId = feedMap[net] ?? feedMap.testnet;
  return getTokenPrice(feedId, { ...options, network: net });
}

// Test helpers
export function _clearPriceCache(): void {
  priceCache.clear();
}
