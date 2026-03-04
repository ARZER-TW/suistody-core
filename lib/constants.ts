// Lazy constants -- defers config read until first access (browser-safe)
import { getConfig } from "./config.js";
import type { SuiNetwork } from "./config.js";

// ---------- Config-dependent getters (lazy, browser-safe) ----------

export function getPackageId(): string {
  return getConfig().packageId;
}

export function getNetwork(): SuiNetwork {
  return getConfig().network;
}

// Backward-compat: re-export config type
export type { SuiNetwork };

// ---------- Static constants (no config dependency) ----------

export const MODULE_NAME = "agent_vault";
export const CLOCK_OBJECT_ID = "0x6";

// Action types (matching Move contract allowed_actions u8 values)
export const ACTION_SWAP = 0;
export const ACTION_STABLE_MINT = 1;
export const ACTION_STABLE_BURN = 2;
export const ACTION_STABLE_CLAIM = 3;

// Vault status constants (matching Move contract)
export const STATUS_ACTIVE = 0;
export const STATUS_PAUSED = 1;
export const STATUS_LOCKED = 2;

export const STATUS_LABELS: Record<number, string> = {
  0: "Active",
  1: "Paused",
  2: "Locked",
};

export const ACTION_LABELS: Record<number, string> = {
  0: "Swap",
  1: "Stable Mint",
  2: "Stable Burn",
  3: "Stable Claim",
};

// Token type addresses (network-dependent)
export const SUI_TYPE = "0x2::sui::SUI";

const USDC_TYPES: Record<string, string> = {
  testnet:
    "0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48::usdc::USDC",
  mainnet:
    "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
};

export function getUsdcType(): string {
  return USDC_TYPES[getNetwork()] ?? USDC_TYPES.testnet;
}

// Unit conversion -- pure bigint arithmetic, no floating-point
export function suiToMist(sui: number): bigint {
  const str = sui.toFixed(9);
  const dotIndex = str.indexOf(".");

  if (dotIndex === -1) {
    return BigInt(str) * 1_000_000_000n;
  }

  const whole = str.slice(0, dotIndex);
  const frac = str.slice(dotIndex + 1).slice(0, 9).padEnd(9, "0");

  const sign = sui < 0 ? -1n : 1n;
  const absWhole = whole.replace("-", "");

  return sign * (BigInt(absWhole) * 1_000_000_000n + BigInt(frac));
}

export function mistToSui(mist: bigint): number {
  return Number(mist) / 1e9;
}
