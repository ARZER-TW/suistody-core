import { describe, it, expect } from "vitest";
import { checkPolicy } from "../policy-checker.js";
import type { VaultData } from "../../vault/types.js";

function makeVault(overrides: Partial<VaultData> = {}): VaultData {
  return {
    id: "0xvault",
    owner: "0xowner",
    balance: 10_000_000_000n, // 10 SUI
    policy: {
      maxBudget: 5_000_000_000n, // 5 SUI
      maxPerTx: 1_000_000_000n, // 1 SUI
      allowedActions: [0], // swap only
      cooldownMs: 60_000, // 60s
      expiresAt: Date.now() + 3_600_000, // 1 hour from now
    },
    authorizedCaps: ["0xcap1"],
    totalSpent: 0n,
    lastTxTime: 0,
    txCount: 0,
    ...overrides,
  };
}

describe("checkPolicy", () => {
  it("allows valid action within all limits", () => {
    const vault = makeVault();
    const result = checkPolicy({
      vault,
      amount: 500_000_000n, // 0.5 SUI
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("Policy check passed");
  });

  it("rejects zero amount", () => {
    const vault = makeVault();
    const result = checkPolicy({
      vault,
      amount: 0n,
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("greater than zero");
  });

  it("rejects expired policy", () => {
    const vault = makeVault({
      policy: {
        ...makeVault().policy,
        expiresAt: Date.now() - 1000, // expired
      },
    });
    const result = checkPolicy({
      vault,
      amount: 100_000_000n,
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("rejects during cooldown period", () => {
    const now = Date.now();
    const vault = makeVault({
      txCount: 1,
      lastTxTime: now - 10_000, // 10 seconds ago
    });

    const result = checkPolicy({
      vault,
      amount: 100_000_000n,
      actionType: 0,
      nowMs: now,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cooldown");
  });

  it("allows after cooldown period", () => {
    const now = Date.now();
    const vault = makeVault({
      txCount: 1,
      lastTxTime: now - 120_000, // 2 minutes ago (> 60s cooldown)
    });

    const result = checkPolicy({
      vault,
      amount: 100_000_000n,
      actionType: 0,
      nowMs: now,
    });

    expect(result.allowed).toBe(true);
  });

  it("skips cooldown check for first transaction", () => {
    const vault = makeVault({ txCount: 0, lastTxTime: 0 });
    const result = checkPolicy({
      vault,
      amount: 100_000_000n,
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(true);
  });

  it("rejects amount exceeding per-tx limit", () => {
    const vault = makeVault();
    const result = checkPolicy({
      vault,
      amount: 2_000_000_000n, // 2 SUI (max is 1 SUI)
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("per-tx limit");
  });

  it("rejects amount exceeding remaining budget", () => {
    const vault = makeVault({
      totalSpent: 4_500_000_000n, // 4.5 SUI spent (0.5 remaining)
    });

    const result = checkPolicy({
      vault,
      amount: 1_000_000_000n, // 1 SUI > 0.5 SUI remaining
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("budget");
  });

  it("rejects non-whitelisted action type", () => {
    const vault = makeVault(); // only action 0 allowed
    const result = checkPolicy({
      vault,
      amount: 100_000_000n,
      actionType: 1, // limit_order not in allowed list
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not whitelisted");
  });

  it("rejects insufficient balance", () => {
    const vault = makeVault({
      balance: 50_000_000n, // 0.05 SUI
    });

    const result = checkPolicy({
      vault,
      amount: 100_000_000n, // 0.1 SUI > 0.05 SUI balance
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Insufficient");
  });

  it("allows non-withdrawal action (no amount) when action is whitelisted", () => {
    const vault = makeVault({
      policy: {
        ...makeVault().policy,
        allowedActions: [0, 2, 3], // swap, stable_burn, stable_claim
      },
    });

    const result = checkPolicy({
      vault,
      actionType: 2, // stable_burn
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("Policy check passed");
  });

  it("rejects non-withdrawal action when action type is not whitelisted", () => {
    const vault = makeVault(); // only action 0 allowed

    const result = checkPolicy({
      vault,
      actionType: 3, // stable_claim not in allowed list
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not whitelisted");
  });

  it("still checks cooldown for non-withdrawal actions", () => {
    const now = Date.now();
    const vault = makeVault({
      policy: {
        ...makeVault().policy,
        allowedActions: [0, 3],
      },
      txCount: 1,
      lastTxTime: now - 10_000, // 10s ago (< 60s cooldown)
    });

    const result = checkPolicy({
      vault,
      actionType: 3,
      nowMs: now,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cooldown");
  });

  it("still checks expiry for non-withdrawal actions", () => {
    const vault = makeVault({
      policy: {
        ...makeVault().policy,
        allowedActions: [0, 2],
        expiresAt: Date.now() - 1000,
      },
    });

    const result = checkPolicy({
      vault,
      actionType: 2,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("allows amount exactly equal to maxPerTx", () => {
    const vault = makeVault();
    const result = checkPolicy({
      vault,
      amount: 1_000_000_000n, // exactly maxPerTx
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(true);
  });

  it("allows amount exactly equal to remaining budget", () => {
    const vault = makeVault({
      totalSpent: 4_000_000_000n, // 4 SUI spent, 1 SUI remaining = maxPerTx
    });

    const result = checkPolicy({
      vault,
      amount: 1_000_000_000n, // exactly remaining budget
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(true);
  });

  it("allows amount exactly equal to vault balance", () => {
    const vault = makeVault({
      balance: 1_000_000_000n, // exactly 1 SUI
    });

    const result = checkPolicy({
      vault,
      amount: 1_000_000_000n, // exactly balance
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(true);
  });

  it("rejects when allowedActions is empty", () => {
    const vault = makeVault({
      policy: {
        ...makeVault().policy,
        allowedActions: [],
      },
    });

    const result = checkPolicy({
      vault,
      amount: 100_000_000n,
      actionType: 0,
      nowMs: Date.now(),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not whitelisted");
  });
});
