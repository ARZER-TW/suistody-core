import type { VaultData } from "../vault/types.js";

export interface PolicyCheckResult {
  allowed: boolean;
  reason: string;
}

/**
 * Pre-check an agent action against vault policy (off-chain).
 * This is a gas-saving optimization only -- the Move contract performs
 * authoritative enforcement on-chain. Do NOT rely on this as a security boundary.
 *
 * IMPORTANT: `nowMs` is caller-supplied. The on-chain contract uses its own clock.
 * Vault data may also be stale (fetched at an earlier time). Always submit the
 * transaction to the chain for final enforcement.
 *
 * When `amount` is provided, withdrawal-related checks are enforced
 * (per-tx limit, remaining budget, vault balance).
 * When `amount` is omitted, only expiry, cooldown, and action whitelist are checked.
 */
export function checkPolicy(params: {
  vault: VaultData;
  actionType: number;
  nowMs: number;
  amount?: bigint;
}): PolicyCheckResult {
  const { vault, actionType, nowMs, amount } = params;
  const { policy } = vault;

  // 1. Expiry
  if (nowMs >= policy.expiresAt) {
    return { allowed: false, reason: "Policy has expired" };
  }

  // 2. Cooldown (skip for first tx)
  if (vault.txCount > 0) {
    const elapsed = nowMs - vault.lastTxTime;
    if (elapsed < policy.cooldownMs) {
      const remaining = policy.cooldownMs - elapsed;
      const remainingSec = Math.ceil(remaining / 1000);
      return {
        allowed: false,
        reason: `Cooldown active: ${remainingSec}s remaining`,
      };
    }
  }

  // 3. Action whitelist
  if (!policy.allowedActions.includes(actionType)) {
    return {
      allowed: false,
      reason: `Action type ${actionType} is not whitelisted`,
    };
  }

  // 4. Amount-related checks (only for withdrawal actions)
  if (amount !== undefined) {
    if (amount <= 0n) {
      return { allowed: false, reason: "Amount must be greater than zero" };
    }

    if (amount > policy.maxPerTx) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds per-tx limit ${policy.maxPerTx}`,
      };
    }

    const remainingBudget = policy.maxBudget - vault.totalSpent;
    if (amount > remainingBudget) {
      return {
        allowed: false,
        reason: `Amount ${amount} exceeds remaining budget ${remainingBudget}`,
      };
    }

    if (amount > vault.balance) {
      return {
        allowed: false,
        reason: `Insufficient vault balance: ${vault.balance} < ${amount}`,
      };
    }
  }

  return { allowed: true, reason: "Policy check passed" };
}
