import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { getNetwork } from "../constants.js";

let client: SuiClient | null = null;

/**
 * Get a SuiClient singleton. Uses network from config (lazy).
 * Can also accept an injected client for browser / dapp-kit integration.
 */
export function getSuiClient(injected?: SuiClient): SuiClient {
  if (injected) {
    client = injected;
    return client;
  }
  if (!client) {
    client = new SuiClient({ url: getFullnodeUrl(getNetwork()) });
  }
  return client;
}

// Test helper
export function _resetClient(): void {
  client = null;
}
