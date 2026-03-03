/**
 * Dry-run a transaction block before submitting.
 *
 * Returns structured result: either success with gas estimate,
 * or failure with a readable error message.
 */
import type { Transaction } from "@mysten/sui/transactions";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { getSuiClient } from "../sui/client.js";

export interface DryRunSuccess {
  ok: true;
  gasUsed: {
    computationCost: string;
    storageCost: string;
    storageRebate: string;
  };
}

export interface DryRunFailure {
  ok: false;
  error: string;
  abortCode?: string;
}

export type DryRunResult = DryRunSuccess | DryRunFailure;

export async function dryRunTransaction(params: {
  transaction: Transaction;
  senderKeypair: Ed25519Keypair;
}): Promise<DryRunResult> {
  const { transaction, senderKeypair } = params;
  const client = getSuiClient();

  const sender = senderKeypair.getPublicKey().toSuiAddress();
  transaction.setSender(sender);

  const txBytes = await transaction.build({ client });

  const result = await client.dryRunTransactionBlock({
    transactionBlock: txBytes,
  });

  const status = result.effects.status;

  if (status.status === "success") {
    return {
      ok: true,
      gasUsed: {
        computationCost: result.effects.gasUsed.computationCost,
        storageCost: result.effects.gasUsed.storageCost,
        storageRebate: result.effects.gasUsed.storageRebate,
      },
    };
  }

  return {
    ok: false,
    error: status.error ?? "Transaction would fail on-chain",
    abortCode: extractAbortCode(status.error),
  };
}

function extractAbortCode(error?: string): string | undefined {
  if (!error) return undefined;
  const match = error.match(/MoveAbort.*?(\d+)/);
  return match?.[1];
}
