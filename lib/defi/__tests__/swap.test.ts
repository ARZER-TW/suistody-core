import { describe, it, expect, vi, beforeEach } from "vitest";
import { getSwapQuote, buildAgentSwap } from "../swap.js";
import type { PoolInfo } from "../pool-discovery.js";

// Mock oracle
vi.mock("../oracle.js", () => ({
  getSuiUsdPrice: vi.fn().mockResolvedValue({
    price: 1.0,
    confidence: 0.001,
    timestamp: 1700000000000,
    source: "pyth",
  }),
}));

// Mock pool-discovery
vi.mock("../pool-discovery.js", () => ({
  findPool: vi.fn(),
}));

const SUI_TYPE = "0x2::sui::SUI";
const USDC_TYPE =
  "0xa1ec7fc00a6f40db9693ad1415d0c193ad3906494428cf252621037bd7117e29::usdc::USDC";

const VALID_ADDRESS =
  "0x" + "a".repeat(64);
const VALID_ADDRESS_2 =
  "0x" + "b".repeat(64);

const MOCK_POOL: PoolInfo = {
  poolId: "0x" + "1".repeat(64),
  dexPackageId: "0x" + "2".repeat(64),
  globalConfigId: "0x" + "3".repeat(64),
  coinTypeA: SUI_TYPE,
  coinTypeB: USDC_TYPE,
  a2b: true,
  dex: "cetus",
};

describe("getSwapQuote", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calculates SUI→USDC quote with default slippage", async () => {
    const quote = await getSwapQuote({
      tokenIn: SUI_TYPE,
      tokenOut: USDC_TYPE,
      amountIn: 1_000_000_000n, // 1 SUI
    });

    expect(quote.amountIn).toBe(1_000_000_000n);
    expect(quote.route).toBe("cetus");
    expect(quote.tokenIn).toBe(SUI_TYPE);
    expect(quote.tokenOut).toBe(USDC_TYPE);
    // At $1.00/SUI, 1 SUI = 1 USDC = 1_000_000 (6 decimals)
    expect(quote.estimatedAmountOut).toBe(1_000_000n);
    // Default 50bps (0.5%) slippage
    expect(quote.minAmountOut).toBe(995_000n);
  });

  it("respects custom slippage", async () => {
    const quote = await getSwapQuote({
      tokenIn: SUI_TYPE,
      tokenOut: USDC_TYPE,
      amountIn: 1_000_000_000n,
      slippageBps: 100, // 1%
    });

    // 1% slippage: 1_000_000 * 0.99 = 990_000
    expect(quote.minAmountOut).toBe(990_000n);
  });

  it("calculates USDC→SUI quote", async () => {
    const quote = await getSwapQuote({
      tokenIn: USDC_TYPE,
      tokenOut: SUI_TYPE,
      amountIn: 1_000_000n, // 1 USDC
    });

    // At $1.00/SUI, 1 USDC = 1 SUI = 1_000_000_000 (9 decimals)
    expect(quote.estimatedAmountOut).toBe(1_000_000_000n);
  });

  it("handles fractional SUI amounts", async () => {
    const quote = await getSwapQuote({
      tokenIn: SUI_TYPE,
      tokenOut: USDC_TYPE,
      amountIn: 500_000_000n, // 0.5 SUI
    });

    // 0.5 SUI * $1.00 = 0.5 USDC = 500_000
    expect(quote.estimatedAmountOut).toBe(500_000n);
  });
});

describe("buildAgentSwap", () => {
  it("returns a Transaction object for SUI→USDC swap", () => {
    const tx = buildAgentSwap({
      vaultId: "0x" + "4".repeat(64),
      agentCapId: "0x" + "6".repeat(64),
      amountIn: 1_000_000_000n,
      minAmountOut: 995_000n,
      recipientAddress: VALID_ADDRESS,
      pool: MOCK_POOL,
    });

    expect(tx).toBeDefined();
    // Transaction should be a valid Sui Transaction object
    expect(typeof tx.serialize).toBe("function");
  });

  it("returns a Transaction object for USDC→SUI swap", () => {
    const reversePool: PoolInfo = {
      ...MOCK_POOL,
      a2b: false,
    };

    const tx = buildAgentSwap({
      vaultId: "0x" + "4".repeat(64),
      agentCapId: "0x" + "6".repeat(64),
      amountIn: 1_000_000n,
      minAmountOut: 995_000_000n,
      recipientAddress: VALID_ADDRESS,
      pool: reversePool,
    });

    expect(tx).toBeDefined();
    expect(typeof tx.serialize).toBe("function");
  });

  it("builds different transactions for different params", () => {
    const tx1 = buildAgentSwap({
      vaultId: "0x" + "4".repeat(64),
      agentCapId: "0x" + "6".repeat(64),
      amountIn: 1_000_000_000n,
      minAmountOut: 995_000n,
      recipientAddress: VALID_ADDRESS,
      pool: MOCK_POOL,
    });

    const tx2 = buildAgentSwap({
      vaultId: "0x" + "5".repeat(64),
      agentCapId: "0x" + "7".repeat(64),
      amountIn: 2_000_000_000n,
      minAmountOut: 1_990_000n,
      recipientAddress: VALID_ADDRESS_2,
      pool: MOCK_POOL,
    });

    // They should be distinct Transaction instances
    expect(tx1).not.toBe(tx2);
  });
});
