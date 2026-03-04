import { describe, it, expect, beforeEach } from "vitest";
import { suiToMist, mistToSui, getUsdcType, getPackageId, getNetwork } from "../constants.js";
import { _resetConfig } from "../config.js";

describe("suiToMist", () => {
  it("converts 1 SUI to 1_000_000_000 MIST", () => {
    expect(suiToMist(1)).toBe(1_000_000_000n);
  });

  it("converts 0 SUI to 0 MIST", () => {
    expect(suiToMist(0)).toBe(0n);
  });

  it("converts fractional SUI correctly", () => {
    expect(suiToMist(0.5)).toBe(500_000_000n);
    expect(suiToMist(0.001)).toBe(1_000_000n);
  });

  it("converts large values", () => {
    expect(suiToMist(1000)).toBe(1_000_000_000_000n);
  });

  it("floors fractional MIST (sub-MIST precision)", () => {
    expect(suiToMist(0.0000000001)).toBe(0n);
  });

  it("handles negative values", () => {
    expect(suiToMist(-1)).toBe(-1_000_000_000n);
  });

  it("converts 0.1 SUI without floating-point error", () => {
    expect(suiToMist(0.1)).toBe(100_000_000n);
  });
});

describe("mistToSui", () => {
  it("converts 1_000_000_000 MIST to 1 SUI", () => {
    expect(mistToSui(1_000_000_000n)).toBe(1);
  });

  it("converts 0 MIST to 0 SUI", () => {
    expect(mistToSui(0n)).toBe(0);
  });

  it("converts fractional SUI values", () => {
    expect(mistToSui(500_000_000n)).toBe(0.5);
    expect(mistToSui(1_000_000n)).toBe(0.001);
  });

  it("handles very large BigInt values", () => {
    const largeMist = 10_000_000_000_000_000_000n;
    expect(mistToSui(largeMist)).toBe(10_000_000_000);
  });

  it("handles 1 MIST (smallest unit)", () => {
    expect(mistToSui(1n)).toBe(1e-9);
  });
});

describe("lazy config getters", () => {
  beforeEach(() => _resetConfig());

  it("getPackageId returns value from env", () => {
    // vitest.config.ts sets PACKAGE_ID env var
    const pkg = getPackageId();
    expect(pkg).toBeTruthy();
    expect(pkg.startsWith("0x")).toBe(true);
  });

  it("getNetwork returns testnet from env", () => {
    expect(getNetwork()).toBe("testnet");
  });
});

describe("getUsdcType", () => {
  it("returns a USDC type string for current network", () => {
    const usdcType = getUsdcType();
    expect(usdcType).toContain("::usdc::USDC");
  });

  it("returns testnet USDC type when network is testnet", () => {
    expect(getNetwork()).toBe("testnet");
    const usdcType = getUsdcType();
    expect(usdcType).toContain("0x14a71d857b34677a7d57e0feb303df1adb515a37780645ab763d42ce8d1a5e48");
  });
});
