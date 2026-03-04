// DEX swap module -- PTB composition for agent_withdraw + Cetus CLMM swap
// No Cetus SDK dependency: uses raw moveCall

import { Transaction } from "@mysten/sui/transactions";
import {
  getPackageId,
  MODULE_NAME,
  CLOCK_OBJECT_ID,
  ACTION_SWAP,
  SUI_TYPE,
} from "../constants.js";
import { getSuiUsdPrice } from "./oracle.js";
import { findPool } from "./pool-discovery.js";
import type { PoolInfo } from "./pool-discovery.js";

// ---------- Types ----------

export interface SwapQuote {
  amountIn: bigint;
  estimatedAmountOut: bigint;
  minAmountOut: bigint;
  priceImpact: number;
  route: string;
  tokenIn: string;
  tokenOut: string;
}

export interface GetSwapQuoteParams {
  tokenIn: string;
  tokenOut: string;
  amountIn: bigint;
  slippageBps?: number; // basis points, default 50 (0.5%)
}

export interface AgentSwapParams {
  vaultId: string;
  agentCapId: string;
  amountIn: bigint;
  minAmountOut: bigint;
  recipientAddress: string;
  pool: PoolInfo;
}

// ---------- Cetus CLMM constants ----------

// Minimum/maximum sqrt price limits for Cetus CLMM swaps
// These are the boundary values that allow maximum slippage
const MIN_SQRT_PRICE_X64 = 4295048016n;
const MAX_SQRT_PRICE_X64 = 79226673515401279992447579055n;

// USDC has 6 decimals
const USDC_DECIMALS = 6;
const SUI_DECIMALS = 9;

// ---------- Quote ----------

export async function getSwapQuote(
  params: GetSwapQuoteParams
): Promise<SwapQuote> {
  const slippageBps = params.slippageBps ?? 50;

  // Get current price from oracle
  const priceData = await getSuiUsdPrice();

  // Calculate estimated output
  // SUI → USDC: amountIn (in MIST) * price / 10^(SUI_DECIMALS - USDC_DECIMALS)
  const isSuiToUsdc =
    params.tokenIn === SUI_TYPE && params.tokenOut.includes("::usdc::USDC");

  let estimatedAmountOut: bigint;

  if (isSuiToUsdc) {
    // Convert MIST to SUI, multiply by USD price, convert to USDC (6 decimals)
    const suiAmount = Number(params.amountIn) / 10 ** SUI_DECIMALS;
    const usdcAmount = suiAmount * priceData.price;
    estimatedAmountOut = BigInt(
      Math.floor(usdcAmount * 10 ** USDC_DECIMALS)
    );
  } else {
    // USDC → SUI
    const usdcAmount = Number(params.amountIn) / 10 ** USDC_DECIMALS;
    const suiAmount = usdcAmount / priceData.price;
    estimatedAmountOut = BigInt(
      Math.floor(suiAmount * 10 ** SUI_DECIMALS)
    );
  }

  // Apply slippage tolerance
  const minAmountOut =
    (estimatedAmountOut * BigInt(10000 - slippageBps)) / 10000n;

  return {
    amountIn: params.amountIn,
    estimatedAmountOut,
    minAmountOut,
    priceImpact: 0, // Approximation -- real impact depends on pool liquidity
    route: "cetus",
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
  };
}

// ---------- PTB Builder ----------

/**
 * Build a composite PTB that:
 * 1. Withdraws SUI from vault via agent_withdraw
 * 2. Swaps via Cetus CLMM pool
 * 3. Transfers output token to recipient
 */
export function buildAgentSwap(params: AgentSwapParams): Transaction {
  const tx = new Transaction();
  const { pool } = params;

  // Step 1: Withdraw from vault
  const withdrawnCoin = tx.moveCall({
    target: `${getPackageId()}::${MODULE_NAME}::agent_withdraw`,
    arguments: [
      tx.object(params.vaultId),
      tx.object(params.agentCapId),
      tx.pure.u64(params.amountIn),
      tx.pure.u8(ACTION_SWAP),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // Step 2: Create zero coin for the non-input side
  const [zeroCoin] = tx.moveCall({
    target: "0x2::coin::zero",
    typeArguments: [pool.a2b ? pool.coinTypeB : pool.coinTypeA],
  });

  // Step 3: Cetus CLMM swap
  const sqrtPriceLimit = pool.a2b
    ? MIN_SQRT_PRICE_X64
    : MAX_SQRT_PRICE_X64;

  const [coinOutA, coinOutB] = tx.moveCall({
    target: `${pool.dexPackageId}::pool::swap`,
    typeArguments: [pool.coinTypeA, pool.coinTypeB],
    arguments: [
      tx.object(pool.globalConfigId),
      tx.object(pool.poolId),
      pool.a2b ? withdrawnCoin : zeroCoin,
      pool.a2b ? zeroCoin : withdrawnCoin,
      tx.pure.bool(pool.a2b),
      tx.pure.bool(true), // by_amount_in
      tx.pure.u64(params.amountIn),
      tx.pure.u128(sqrtPriceLimit),
      tx.object(CLOCK_OBJECT_ID),
    ],
  });

  // Step 4: Transfer output coin to recipient, destroy remainder
  if (pool.a2b) {
    // SUI→USDC: output is coinOutB (USDC), remainder is coinOutA (SUI)
    tx.transferObjects([coinOutB], params.recipientAddress);
    // Merge any SUI remainder back to gas
    tx.mergeCoins(tx.gas, [coinOutA]);
  } else {
    // USDC→SUI: output is coinOutA (SUI), remainder is coinOutB (USDC)
    tx.transferObjects([coinOutA], params.recipientAddress);
    // Transfer any USDC remainder to recipient too
    tx.transferObjects([coinOutB], params.recipientAddress);
  }

  return tx;
}
