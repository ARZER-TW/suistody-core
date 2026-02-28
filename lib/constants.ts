// Contract addresses
const _packageId = process.env.PACKAGE_ID;
if (!_packageId) {
  throw new Error("PACKAGE_ID environment variable is required");
}
export const PACKAGE_ID: string = _packageId;

export const MODULE_NAME = "agent_vault";

// Sui system objects
export const CLOCK_OBJECT_ID = "0x6";

// Network
const VALID_NETWORKS = ["testnet", "devnet", "mainnet"] as const;
type SuiNetwork = (typeof VALID_NETWORKS)[number];

const _network = (process.env.SUI_NETWORK ?? "testnet").trim();
if (!VALID_NETWORKS.includes(_network as SuiNetwork)) {
  throw new Error(`Invalid SUI_NETWORK: "${_network}". Must be one of: ${VALID_NETWORKS.join(", ")}`);
}
export const SUI_NETWORK: SuiNetwork = _network as SuiNetwork;

// Action types (matching Move contract allowed_actions u8 values)
export const ACTION_SWAP = 0;
export const ACTION_STABLE_MINT = 1;
export const ACTION_STABLE_BURN = 2;
export const ACTION_STABLE_CLAIM = 3;

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
  return USDC_TYPES[SUI_NETWORK] ?? USDC_TYPES.testnet;
}

// Unit conversion -- pure bigint arithmetic, no floating-point
export function suiToMist(sui: number): bigint {
  // Handle scientific notation (e.g. 1e-10) by using toFixed
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
