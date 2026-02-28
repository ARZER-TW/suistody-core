import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { SUI_NETWORK } from "../constants";

let client: SuiClient | null = null;

export function getSuiClient(): SuiClient {
  if (!client) {
    client = new SuiClient({ url: getFullnodeUrl(SUI_NETWORK) });
  }
  return client;
}
