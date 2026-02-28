export interface Policy {
  maxBudget: bigint;
  maxPerTx: bigint;
  allowedActions: number[];
  cooldownMs: number;
  expiresAt: number;
}

export interface VaultData {
  id: string;
  owner: string;
  balance: bigint;
  policy: Policy;
  authorizedCaps: string[];
  totalSpent: bigint;
  lastTxTime: number;
  txCount: number;
}

export interface AgentCapData {
  id: string;
  vaultId: string;
}

export interface OwnerCapData {
  id: string;
  vaultId: string;
}

export interface VaultEvent {
  txDigest: string;
  amount: number;
  actionType: number;
  totalSpent: number;
  remainingBudget: number;
  txCount: number;
  timestamp: number;
}
