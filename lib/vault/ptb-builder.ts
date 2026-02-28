/**
 * Browser-safe PTB builders for owner and basic agent operations.
 * These can be safely imported from client-side components ("use client").
 *
 * For Cetus/Stablelayer agent operations (server-only), see ptb-agent.ts.
 */
import { Transaction } from "@mysten/sui/transactions";
import {
  PACKAGE_ID,
  MODULE_NAME,
  CLOCK_OBJECT_ID,
} from "@/lib/constants";

// ============================================================
// Owner Operations
// ============================================================

/**
 * Build PTB to create a new Vault with initial deposit and policy.
 */
export function buildCreateVault(params: {
  coinObjectId?: string;
  depositAmount: bigint;
  maxBudget: bigint;
  maxPerTx: bigint;
  allowedActions: number[];
  cooldownMs: bigint;
  expiresAt: bigint;
  useGasCoin?: boolean;
}): Transaction {
  const tx = new Transaction();

  // Split the exact deposit amount
  // useGasCoin: split from gas coin (non-sponsored, avoids coin conflict)
  // otherwise: split from specific coin object (sponsored mode)
  const source = params.useGasCoin ? tx.gas : tx.object(params.coinObjectId!);
  const [depositCoin] = tx.splitCoins(source, [
    tx.pure.u64(params.depositAmount),
  ]);

  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::create_vault`,
    arguments: [
      depositCoin,
      tx.pure.u64(params.maxBudget),
      tx.pure.u64(params.maxPerTx),
      tx.pure.vector("u8", params.allowedActions),
      tx.pure.u64(params.cooldownMs),
      tx.pure.u64(params.expiresAt),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  return tx;
}

/**
 * Build PTB to deposit SUI from gas coin into a Vault.
 * Splits exact amount from gas coin to avoid coin selection.
 */
export function buildDepositFromGas(params: {
  vaultId: string;
  ownerCapId: string;
  amount: bigint;
}): Transaction {
  const tx = new Transaction();

  const [depositCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(params.amount),
  ]);

  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::deposit`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.ownerCapId),
      depositCoin,
    ],
  });

  return tx;
}

/**
 * Build PTB for owner to withdraw all funds.
 */
export function buildWithdrawAll(params: {
  vaultId: string;
  ownerCapId: string;
  recipientAddress: string;
}): Transaction {
  const tx = new Transaction();

  const coin = tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::withdraw_all`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.ownerCapId),
    ],
  });

  tx.transferObjects([coin], params.recipientAddress);

  return tx;
}

/**
 * Build PTB to create an AgentCap for an agent address.
 */
export function buildCreateAgentCap(params: {
  vaultId: string;
  ownerCapId: string;
  agentAddress: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::create_agent_cap`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.ownerCapId),
      tx.pure.address(params.agentAddress),
    ],
  });

  return tx;
}

/**
 * Build PTB to revoke an AgentCap.
 */
export function buildRevokeAgentCap(params: {
  vaultId: string;
  ownerCapId: string;
  capId: string;
}): Transaction {
  const tx = new Transaction();

  tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::revoke_agent_cap`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.ownerCapId),
      tx.pure.id(params.capId),
    ],
  });

  return tx;
}

// ============================================================
// Agent Operations (browser-safe, no external SDK deps)
// ============================================================

/**
 * Build PTB for agent to withdraw funds (simple transfer, no swap).
 */
export function buildAgentWithdraw(params: {
  vaultId: string;
  agentCapId: string;
  amount: bigint;
  actionType: number;
  recipientAddress: string;
}): Transaction {
  const tx = new Transaction();

  const coin = tx.moveCall({
    target: `${PACKAGE_ID}::${MODULE_NAME}::agent_withdraw`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.agentCapId),
      tx.pure.u64(params.amount),
      tx.pure.u8(params.actionType),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  tx.transferObjects([coin], params.recipientAddress);

  return tx;
}
