import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getSuiUsdPrice,
  getTokenPrice,
  _clearPriceCache,
  FEED_IDS,
} from "../oracle.js";
import type { PriceData } from "../oracle.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function makeHermesResponse(overrides?: {
  price?: string;
  conf?: string;
  expo?: number;
  publish_time?: number;
}) {
  return {
    ok: true,
    json: async () => ({
      parsed: [
        {
          id: "23d7315113f5b1d3ba7a83604c44b94d79f4fd69af77f804fc7f920a6dc65744",
          price: {
            price: overrides?.price ?? "90741000",
            conf: overrides?.conf ?? "75062",
            expo: overrides?.expo ?? -8,
            publish_time: overrides?.publish_time ?? 1700000000,
          },
        },
      ],
    }),
  };
}

describe("oracle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearPriceCache();
  });

  afterEach(() => {
    _clearPriceCache();
  });

  describe("getSuiUsdPrice", () => {
    it("returns parsed price data", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      const result = await getSuiUsdPrice();

      expect(result.source).toBe("pyth");
      expect(result.price).toBeCloseTo(0.90741, 4);
      expect(result.confidence).toBeCloseTo(0.00075062, 6);
      expect(result.timestamp).toBe(1700000000000);
    });

    it("calls correct Hermes endpoint for testnet", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      await getSuiUsdPrice({ network: "testnet" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("hermes-beta.pyth.network")
      );
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(FEED_IDS["SUI/USD"].testnet)
      );
    });

    it("calls correct Hermes endpoint for mainnet", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      await getSuiUsdPrice({ network: "mainnet" });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("hermes.pyth.network")
      );
    });

    it("uses cached result within TTL", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      const first = await getSuiUsdPrice();
      const second = await getSuiUsdPrice();

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it("refreshes after cache clear", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      await getSuiUsdPrice();
      _clearPriceCache();
      await getSuiUsdPrice();

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe("getTokenPrice", () => {
    it("fetches price for arbitrary feed ID", async () => {
      mockFetch.mockResolvedValue(
        makeHermesResponse({ price: "300000000", expo: -6 })
      );

      const result = await getTokenPrice("0xfake_feed");

      expect(result.price).toBe(300);
      expect(result.source).toBe("pyth");
    });

    it("throws on HTTP error", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });

      await expect(getTokenPrice("0xfake")).rejects.toThrow(
        "Pyth Hermes API error: 500"
      );
    });

    it("throws when no parsed data returned", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ parsed: [] }),
      });

      await expect(getTokenPrice("0xbad")).rejects.toThrow(
        "No price data for feed"
      );
    });

    it("throws on fetch failure", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      await expect(getTokenPrice("0xfeed")).rejects.toThrow("Network error");
    });

    it("handles negative exponent correctly", async () => {
      mockFetch.mockResolvedValue(
        makeHermesResponse({ price: "12345", expo: -2 })
      );

      const result = await getTokenPrice("0xtest");
      expect(result.price).toBeCloseTo(123.45, 2);
    });

    it("handles zero exponent", async () => {
      mockFetch.mockResolvedValue(
        makeHermesResponse({ price: "42", expo: 0 })
      );

      const result = await getTokenPrice("0xtest2");
      expect(result.price).toBe(42);
    });

    it("handles positive exponent", async () => {
      mockFetch.mockResolvedValue(
        makeHermesResponse({ price: "5", expo: 2 })
      );

      const result = await getTokenPrice("0xtest3");
      expect(result.price).toBe(500);
    });
  });

  describe("FEED_IDS", () => {
    it("contains SUI/USD feeds for all networks", () => {
      const suiFeed = FEED_IDS["SUI/USD"];
      expect(suiFeed).toBeDefined();
      expect(suiFeed.mainnet).toMatch(/^0x[0-9a-f]{64}$/);
      expect(suiFeed.testnet).toMatch(/^0x[0-9a-f]{64}$/);
      expect(suiFeed.devnet).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe("cache behavior", () => {
    it("caches per feed ID independently", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      await getTokenPrice("0xfeedA");
      await getTokenPrice("0xfeedB");

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("cache hit does not refetch", async () => {
      mockFetch.mockResolvedValue(makeHermesResponse());

      await getTokenPrice("0xfeedC");
      await getTokenPrice("0xfeedC");
      await getTokenPrice("0xfeedC");

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
