import { getSuiClient } from "../sui/client.js";
import { PACKAGE_ID, MODULE_NAME } from "../constants.js";
import type { VaultData, AgentCapData, OwnerCapData, Policy, VaultEvent } from "./types.js";

const VAULT_TYPE = `${PACKAGE_ID}::${MODULE_NAME}::Vault`;
const AGENT_CAP_TYPE = `${PACKAGE_ID}::${MODULE_NAME}::AgentCap`;
const OWNER_CAP_TYPE = `${PACKAGE_ID}::${MODULE_NAME}::OwnerCap`;

// -- Field extraction helpers --

/** Safely unwrap a Move struct field that may be nested as { fields: {...} } or a raw value. */
function unwrapFields(val: unknown): Record<string, unknown> {
  if (val !== null && typeof val === "object" && "fields" in (val as Record<string, unknown>)) {
    const inner = (val as Record<string, unknown>).fields;
    if (inner !== null && typeof inner === "object") {
      return inner as Record<string, unknown>;
    }
  }
  if (val !== null && typeof val === "object") {
    return val as Record<string, unknown>;
  }
  // Primitive value — wrap it so callers can access .value
  return { value: val };
}

function extractFields(content: unknown): Record<string, unknown> {
  const c = content as {
    dataType: string;
    fields?: Record<string, unknown>;
  };
  if (c.dataType !== "moveObject") {
    throw new Error("Expected moveObject content");
  }
  if (!c.fields) throw new Error("Missing fields in moveObject");
  return unwrapFields(c.fields);
}

function parsePolicy(raw: unknown): Policy {
  const f = unwrapFields(raw);
  return {
    maxBudget: BigInt(String(f.max_budget ?? 0)),
    maxPerTx: BigInt(String(f.max_per_tx ?? 0)),
    allowedActions: (f.allowed_actions as number[]) ?? [],
    cooldownMs: Number(f.cooldown_ms ?? 0),
    expiresAt: Number(f.expires_at ?? 0),
  };
}

function parseVaultData(objectId: string, fields: Record<string, unknown>): VaultData {
  const balanceInner = unwrapFields(fields.balance_sui);

  return {
    id: objectId,
    owner: fields.owner as string,
    balance: BigInt(String(balanceInner.value ?? 0)),
    policy: parsePolicy(fields.policy),
    authorizedCaps: (fields.authorized_caps as string[]) ?? [],
    totalSpent: BigInt(String(fields.total_spent ?? 0)),
    lastTxTime: Number(fields.last_tx_time ?? 0),
    txCount: Number(fields.tx_count ?? 0),
  };
}

// -- Public API --

/**
 * Fetch a Vault object by ID from chain.
 */
export async function getVault(vaultId: string): Promise<VaultData> {
  const client = getSuiClient();
  const response = await client.getObject({
    id: vaultId,
    options: { showContent: true, showOwner: true },
  });

  if (!response.data?.content) {
    throw new Error(`Vault not found: ${vaultId}`);
  }

  const fields = extractFields(response.data.content);
  return parseVaultData(vaultId, fields);
}

/**
 * Fetch all OwnerCap objects owned by an address.
 */
export async function getOwnerCaps(ownerAddress: string): Promise<OwnerCapData[]> {
  const client = getSuiClient();
  const caps: OwnerCapData[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNext = true;

  while (hasNext) {
    const page = await client.getOwnedObjects({
      owner: ownerAddress,
      filter: { StructType: OWNER_CAP_TYPE },
      options: { showContent: true },
      cursor,
    });

    for (const item of page.data) {
      if (!item.data?.content) continue;
      const fields = extractFields(item.data.content);
      const vaultId =
        typeof fields.vault_id === "string"
          ? fields.vault_id
          : (fields.vault_id as Record<string, unknown>)?.id ??
            String(fields.vault_id);

      caps.push({
        id: item.data.objectId,
        vaultId: vaultId as string,
      });
    }

    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }

  return caps;
}

/**
 * Fetch all AgentCap objects owned by an address.
 */
export async function getAgentCaps(agentAddress: string): Promise<AgentCapData[]> {
  const client = getSuiClient();
  const caps: AgentCapData[] = [];
  let cursor: string | null | undefined = undefined;
  let hasNext = true;

  while (hasNext) {
    const page = await client.getOwnedObjects({
      owner: agentAddress,
      filter: { StructType: AGENT_CAP_TYPE },
      options: { showContent: true },
      cursor,
    });

    for (const item of page.data) {
      if (!item.data?.content) continue;
      const fields = extractFields(item.data.content);
      const vaultId =
        typeof fields.vault_id === "string"
          ? fields.vault_id
          : (fields.vault_id as Record<string, unknown>)?.id ??
            String(fields.vault_id);

      caps.push({
        id: item.data.objectId,
        vaultId: vaultId as string,
      });
    }

    cursor = page.nextCursor;
    hasNext = page.hasNextPage;
  }

  return caps;
}

/**
 * Fetch all Vaults that an owner controls (via OwnerCaps).
 */
export async function getOwnedVaults(ownerAddress: string): Promise<VaultData[]> {
  const ownerCaps = await getOwnerCaps(ownerAddress);

  if (ownerCaps.length === 0) return [];

  const vaultIds = ownerCaps.map((cap) => cap.vaultId);

  const client = getSuiClient();
  const responses = await client.multiGetObjects({
    ids: vaultIds,
    options: { showContent: true, showOwner: true },
  });

  const vaults: VaultData[] = [];
  for (const response of responses) {
    if (!response.data?.content) continue;
    const fields = extractFields(response.data.content);
    vaults.push(parseVaultData(response.data.objectId, fields));
  }

  return vaults;
}

/**
 * Fetch on-chain AgentWithdrawal events for a given Vault.
 */
export async function getVaultEvents(vaultId: string): Promise<VaultEvent[]> {
  const client = getSuiClient();
  const events = await client.queryEvents({
    query: {
      MoveEventType: `${PACKAGE_ID}::agent_vault::AgentWithdrawal`,
    },
    order: "descending",
    limit: 50,
  });

  return events.data
    .filter((e) => {
      const parsed = e.parsedJson as Record<string, unknown> | undefined;
      return parsed?.vault_id === vaultId;
    })
    .map((e) => {
      const p = e.parsedJson as Record<string, unknown>;
      return {
        txDigest: e.id.txDigest,
        amount: BigInt(String(p.amount ?? 0)),
        actionType: Number(p.action_type),
        totalSpent: BigInt(String(p.total_spent ?? 0)),
        remainingBudget: BigInt(String(p.remaining_budget ?? 0)),
        txCount: Number(p.tx_count),
        timestamp: Number(p.timestamp),
      };
    });
}
