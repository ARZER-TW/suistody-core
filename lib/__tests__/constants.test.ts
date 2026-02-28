import { describe, it, expect } from "vitest";
import { suiToMist, mistToSui } from "../constants";

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
    // 0.0000000001 SUI = 0.1 MIST -> floors to 0
    expect(suiToMist(0.0000000001)).toBe(0n);
  });

  it("handles negative values", () => {
    // Math.floor(-0.5 * 1e9) = -500_000_000
    expect(suiToMist(-1)).toBe(-1_000_000_000n);
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
    // 10 billion SUI in MIST
    const largeMist = 10_000_000_000_000_000_000n;
    expect(mistToSui(largeMist)).toBe(10_000_000_000);
  });

  it("handles 1 MIST (smallest unit)", () => {
    expect(mistToSui(1n)).toBe(1e-9);
  });
});
