/**
 * MultiSig helpers for Sui native k-of-n multi-signature.
 *
 * Sui supports native multi-sig at the account level. An OwnerCap can be
 * owned by a MultiSig address. This module provides helpers to build
 * and combine partial signatures for multi-sig transactions.
 *
 * Usage:
 *   1. Create a MultiSig address from multiple public keys + threshold
 *   2. Transfer the OwnerCap to that MultiSig address
 *   3. When executing owner operations, each signer signs the TX bytes
 *   4. Combine signatures using `combineMultiSigSignatures`
 *   5. Submit the combined transaction
 *
 * @see https://docs.sui.io/concepts/cryptography/transaction-auth/multisig
 */
import type { Transaction } from "@mysten/sui/transactions";
import type { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { MultiSigPublicKey } from "@mysten/sui/multisig";
import { getSuiClient } from "../sui/client.js";

export interface MultiSigConfig {
  /** Public keys of all signers */
  publicKeys: { publicKey: Ed25519Keypair; weight: number }[];
  /** Number of signatures required (k in k-of-n) */
  threshold: number;
}

/**
 * Derive a MultiSig address from public keys and threshold.
 */
export function deriveMultiSigAddress(config: MultiSigConfig): string {
  const multiSigPk = MultiSigPublicKey.fromPublicKeys({
    publicKeys: config.publicKeys.map((pk) => ({
      publicKey: pk.publicKey.getPublicKey(),
      weight: pk.weight,
    })),
    threshold: config.threshold,
  });

  return multiSigPk.toSuiAddress();
}

/**
 * Build and partially sign a multi-sig transaction.
 * Each signer calls this, then signatures are combined.
 */
export async function buildMultiSigTransaction(params: {
  transaction: Transaction;
  multiSigConfig: MultiSigConfig;
  signers: Ed25519Keypair[];
}): Promise<string> {
  const { transaction, multiSigConfig, signers } = params;
  const client = getSuiClient();

  const multiSigPk = MultiSigPublicKey.fromPublicKeys({
    publicKeys: multiSigConfig.publicKeys.map((pk) => ({
      publicKey: pk.publicKey.getPublicKey(),
      weight: pk.weight,
    })),
    threshold: multiSigConfig.threshold,
  });

  const multiSigAddress = multiSigPk.toSuiAddress();
  transaction.setSender(multiSigAddress);

  const txBytes = await transaction.build({ client });

  const signatures = await Promise.all(
    signers.map((signer) => signer.signTransaction(txBytes))
  );

  const combinedSignature = multiSigPk.combinePartialSignatures(
    signatures.map((s) => s.signature)
  );

  const result = await client.executeTransactionBlock({
    transactionBlock: txBytes,
    signature: combinedSignature,
    options: { showEffects: true },
  });

  const status = result.effects?.status?.status;
  if (status !== "success") {
    const errorMsg = result.effects?.status?.error ?? "MultiSig TX failed on-chain";
    throw new Error(`MultiSig TX failed: ${errorMsg}`);
  }

  return result.digest;
}
