// Lazy configuration -- supports both Node.js (process.env) and browser (initSuistody)

export type SuiNetwork = "testnet" | "devnet" | "mainnet";

export interface SuistodyConfig {
  packageId: string;
  network: SuiNetwork;
}

let _config: SuistodyConfig | null = null;
let _initialized = false;

const VALID_NETWORKS: readonly SuiNetwork[] = [
  "testnet",
  "devnet",
  "mainnet",
];

/**
 * Initialize the SDK with explicit config.
 * Required in browser environments. Optional in Node.js (falls back to process.env).
 */
export function initSuistody(config: SuistodyConfig): void {
  if (!config.packageId) {
    throw new Error("packageId is required");
  }
  if (!VALID_NETWORKS.includes(config.network)) {
    throw new Error(
      `Invalid network: "${config.network}". Must be one of: ${VALID_NETWORKS.join(", ")}`
    );
  }
  _config = { ...config };
  _initialized = true;
}

/**
 * Get the current config. Auto-detects from process.env if initSuistody() was not called.
 */
export function getConfig(): SuistodyConfig {
  if (_config) {
    return _config;
  }

  // Auto-detect from process.env (Node.js backward compatibility)
  const envPackageId =
    typeof process !== "undefined" ? process.env?.PACKAGE_ID : undefined;
  const envNetwork =
    typeof process !== "undefined"
      ? (process.env?.SUI_NETWORK ?? "testnet")
      : "testnet";

  if (!envPackageId) {
    throw new Error(
      "SDK not initialized. Call initSuistody({ packageId, network }) or set PACKAGE_ID environment variable."
    );
  }

  const network = envNetwork.trim() as SuiNetwork;
  if (!VALID_NETWORKS.includes(network)) {
    throw new Error(
      `Invalid SUI_NETWORK: "${network}". Must be one of: ${VALID_NETWORKS.join(", ")}`
    );
  }

  // Cache for subsequent calls
  _config = { packageId: envPackageId, network };
  return _config;
}

/**
 * Check if SDK has been initialized (either via initSuistody or env auto-detect).
 */
export function isInitialized(): boolean {
  return _initialized || _config !== null;
}

// Test helper
export function _resetConfig(): void {
  _config = null;
  _initialized = false;
}
