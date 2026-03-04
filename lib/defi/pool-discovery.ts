// DEX pool discovery and configuration
// Supports Cetus CLMM via REST API + hardcoded fallback for testnet

import { SUI_TYPE } from "../constants.js";

export interface PoolInfo {
  poolId: string;
  dexPackageId: string;
  globalConfigId: string;
  coinTypeA: string;
  coinTypeB: string;
  a2b: boolean; // direction: true = coinA→coinB
  dex: "cetus" | "deepbook";
}

// ---------- Known Cetus testnet config ----------

const CETUS_TESTNET_PACKAGE =
  "0x5372d555ac734e272659136c2a0cd3227f9b92de67c80dc11250307268af2db8";

const CETUS_TESTNET_GLOBAL_CONFIG =
  "0x9774e359588ead122af1c7e7f64e14571f22e1569a08566be3c7a1a00160f0d3";

const USDC_TESTNET_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

// ---------- Pool cache ----------

interface CacheEntry {
  pool: PoolInfo;
  expiresAt: number;
}

const POOL_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const poolCache = new Map<string, CacheEntry>();

function cacheKey(tokenIn: string, tokenOut: string): string {
  return `${tokenIn}|${tokenOut}`;
}

// ---------- Cetus API ----------

const CETUS_API_BASE = "https://api-sui.cetus.zone";

interface CetusPoolResponse {
  data?: {
    lp_list?: Array<{
      swap_account: string;
      coin_a_address: string;
      coin_b_address: string;
    }>;
  };
}

async function fetchCetusPool(
  coinTypeA: string,
  coinTypeB: string
): Promise<string | null> {
  try {
    const url = `${CETUS_API_BASE}/v2/sui/pools_info?coin_type_a=${encodeURIComponent(coinTypeA)}&coin_type_b=${encodeURIComponent(coinTypeB)}`;
    const response = await fetch(url);
    if (!response.ok) return null;

    const json = (await response.json()) as CetusPoolResponse;
    const pools = json.data?.lp_list;
    if (!pools || pools.length === 0) return null;

    return pools[0].swap_account;
  } catch {
    return null;
  }
}

// ---------- Public API ----------

export interface FindPoolOptions {
  network?: string;
}

export async function findPool(
  tokenIn: string,
  tokenOut: string,
  options?: FindPoolOptions
): Promise<PoolInfo> {
  const key = cacheKey(tokenIn, tokenOut);
  const now = Date.now();
  const cached = poolCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.pool;
  }

  const network = options?.network ?? process.env.SUI_NETWORK ?? "testnet";

  // Determine direction relative to Cetus pool ordering
  // Cetus convention: SUI is usually coinTypeA, USDC is coinTypeB
  const isSuiToUsdc =
    tokenIn === SUI_TYPE && tokenOut.includes("::usdc::USDC");
  const isUsdcToSui =
    tokenIn.includes("::usdc::USDC") && tokenOut === SUI_TYPE;

  if (!isSuiToUsdc && !isUsdcToSui) {
    throw new Error(
      `Unsupported swap pair: ${tokenIn} -> ${tokenOut}. Currently only SUI <-> USDC is supported.`
    );
  }

  const coinTypeA = SUI_TYPE;
  const coinTypeB =
    network === "mainnet"
      ? "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC"
      : USDC_TESTNET_TYPE;

  // Try Cetus API first, fallback to hardcoded
  let poolId: string | null = null;
  if (network !== "devnet") {
    poolId = await fetchCetusPool(coinTypeA, coinTypeB);
  }

  if (!poolId) {
    throw new Error(
      `No pool found for ${tokenIn} -> ${tokenOut} on ${network}. ` +
        "Cetus API returned no results and no hardcoded fallback available."
    );
  }

  const pool: PoolInfo = {
    poolId,
    dexPackageId: CETUS_TESTNET_PACKAGE,
    globalConfigId: CETUS_TESTNET_GLOBAL_CONFIG,
    coinTypeA,
    coinTypeB,
    a2b: isSuiToUsdc,
    dex: "cetus",
  };

  poolCache.set(key, { pool, expiresAt: now + POOL_CACHE_TTL_MS });

  return pool;
}

// Test helper
export function _clearPoolCache(): void {
  poolCache.clear();
}
