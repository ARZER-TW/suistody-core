import { describe, it, expect } from "vitest";

import {
  buildCreateVault,
  buildDepositFromGas,
  buildWithdrawAll,
  buildCreateAgentCap,
  buildRevokeAgentCap,
  buildAgentWithdraw,
} from "../ptb-builder";

// Valid Sui addresses for testing (64 hex chars after 0x)
const ADDR_AGENT =
  "0x0000000000000000000000000000000000000000000000000000000000000002";
const ADDR_RECIPIENT =
  "0x0000000000000000000000000000000000000000000000000000000000000003";
const ADDR_CAP =
  "0x0000000000000000000000000000000000000000000000000000000000000004";

describe("buildCreateVault", () => {
  it("returns a Transaction for valid params with useGasCoin", () => {
    const tx = buildCreateVault({
      depositAmount: 1_000_000_000n,
      maxBudget: 5_000_000_000n,
      maxPerTx: 500_000_000n,
      allowedActions: [0],
      cooldownMs: 60_000n,
      expiresAt: BigInt(Date.now() + 3_600_000),
      useGasCoin: true,
    });

    expect(tx).toBeDefined();
    expect(typeof tx.serialize).toBe("function");
  });

  it("returns a Transaction when using coinObjectId", () => {
    const tx = buildCreateVault({
      coinObjectId: "0xcoin123",
      depositAmount: 500_000_000n,
      maxBudget: 2_000_000_000n,
      maxPerTx: 200_000_000n,
      allowedActions: [0],
      cooldownMs: 30_000n,
      expiresAt: BigInt(Date.now() + 7_200_000),
    });

    expect(tx).toBeDefined();
  });

  it("handles empty allowedActions array", () => {
    const tx = buildCreateVault({
      depositAmount: 1_000_000_000n,
      maxBudget: 5_000_000_000n,
      maxPerTx: 500_000_000n,
      allowedActions: [],
      cooldownMs: 0n,
      expiresAt: 0n,
      useGasCoin: true,
    });

    expect(tx).toBeDefined();
  });

  it("handles multiple allowedActions", () => {
    const tx = buildCreateVault({
      depositAmount: 1_000_000_000n,
      maxBudget: 5_000_000_000n,
      maxPerTx: 500_000_000n,
      allowedActions: [0, 1, 2, 3],
      cooldownMs: 60_000n,
      expiresAt: BigInt(Date.now() + 3_600_000),
      useGasCoin: true,
    });

    expect(tx).toBeDefined();
  });

  it("handles zero deposit amount", () => {
    const tx = buildCreateVault({
      depositAmount: 0n,
      maxBudget: 0n,
      maxPerTx: 0n,
      allowedActions: [0],
      cooldownMs: 0n,
      expiresAt: 0n,
      useGasCoin: true,
    });

    expect(tx).toBeDefined();
  });
});

describe("buildDepositFromGas", () => {
  it("returns a Transaction for valid params", () => {
    const tx = buildDepositFromGas({
      vaultId: "0xvault1",
      ownerCapId: "0xcap1",
      amount: 1_000_000_000n,
    });

    expect(tx).toBeDefined();
  });

  it("handles zero amount", () => {
    const tx = buildDepositFromGas({
      vaultId: "0xvault1",
      ownerCapId: "0xcap1",
      amount: 0n,
    });

    expect(tx).toBeDefined();
  });

  it("handles large deposit amount", () => {
    const tx = buildDepositFromGas({
      vaultId: "0xvault1",
      ownerCapId: "0xcap1",
      amount: 100_000_000_000n,
    });

    expect(tx).toBeDefined();
  });
});

describe("buildWithdrawAll", () => {
  it("returns a Transaction for valid params", () => {
    const tx = buildWithdrawAll({
      vaultId: "0xvault1",
      ownerCapId: "0xcap1",
      recipientAddress: ADDR_RECIPIENT,
    });

    expect(tx).toBeDefined();
  });
});

describe("buildCreateAgentCap", () => {
  it("returns a Transaction for valid params", () => {
    const tx = buildCreateAgentCap({
      vaultId: "0xvault1",
      ownerCapId: "0xcap1",
      agentAddress: ADDR_AGENT,
    });

    expect(tx).toBeDefined();
  });
});

describe("buildRevokeAgentCap", () => {
  it("returns a Transaction for valid params", () => {
    const tx = buildRevokeAgentCap({
      vaultId: "0xvault1",
      ownerCapId: "0xcap1",
      capId: ADDR_CAP,
    });

    expect(tx).toBeDefined();
  });
});

describe("buildAgentWithdraw", () => {
  it("returns a Transaction for valid params", () => {
    const tx = buildAgentWithdraw({
      vaultId: "0xvault1",
      agentCapId: "0xcap1",
      amount: 500_000_000n,
      actionType: 0,
      recipientAddress: ADDR_RECIPIENT,
    });

    expect(tx).toBeDefined();
  });

  it("handles different action types", () => {
    const tx = buildAgentWithdraw({
      vaultId: "0xvault1",
      agentCapId: "0xcap1",
      amount: 100_000_000n,
      actionType: 1,
      recipientAddress: ADDR_RECIPIENT,
    });

    expect(tx).toBeDefined();
  });
});
