// Contract addresses
export const PACKAGE_ID =
  process.env.PACKAGE_ID ??
  "0xf01673d606536731ca79fe85324026cdf9c7b2471bbf61a29b03ce911fe5c7d1";

export const MODULE_NAME = "agent_vault";

// Sui system objects
export const CLOCK_OBJECT_ID = "0x6";

// Network
export const SUI_NETWORK =
  ((process.env.SUI_NETWORK ?? "testnet").trim() as "testnet" | "devnet" | "mainnet");

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

// Unit conversion
export function suiToMist(sui: number): bigint {
  return BigInt(Math.floor(sui * 1e9));
}

export function mistToSui(mist: bigint): number {
  return Number(mist) / 1e9;
}
