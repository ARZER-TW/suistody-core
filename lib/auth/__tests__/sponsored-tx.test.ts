import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../sui/client", () => ({
  getSuiClient: vi.fn(),
}));

vi.mock("@mysten/sui/keypairs/ed25519", () => {
  const mockKeypair = {
    getPublicKey: () => ({
      toSuiAddress: () => "0xagent_address",
    }),
    signTransaction: vi.fn().mockResolvedValue({ signature: "agent_sig" }),
  };
  return {
    Ed25519Keypair: {
      fromSecretKey: vi.fn().mockReturnValue({
        getPublicKey: () => ({
          toSuiAddress: () => "0xsponsor_address",
        }),
        signTransaction: vi.fn().mockResolvedValue({ signature: "sponsor_sig" }),
      }),
    },
    // Allow constructing agent keypairs
    __mockKeypair: mockKeypair,
  };
});

import { executeAgentTransaction, executeSponsoredAgentTransaction } from "../sponsored-tx";
import { getSuiClient } from "../../sui/client";

function makeMockClient(overrides: Record<string, unknown> = {}) {
  return {
    signAndExecuteTransaction: vi.fn(),
    executeTransactionBlock: vi.fn(),
    ...overrides,
  };
}

function makeMockTransaction() {
  return {
    setSender: vi.fn(),
    setGasOwner: vi.fn(),
    build: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
  };
}

function makeMockKeypair() {
  return {
    getPublicKey: () => ({
      toSuiAddress: () => "0xagent_address",
    }),
    signTransaction: vi.fn().mockResolvedValue({ signature: "agent_sig" }),
  };
}

describe("executeAgentTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns digest on successful transaction", async () => {
    const mockClient = makeMockClient({
      signAndExecuteTransaction: vi.fn().mockResolvedValue({
        digest: "tx_digest_123",
        effects: { status: { status: "success" } },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const result = await executeAgentTransaction({
      transaction: makeMockTransaction() as never,
      agentKeypair: makeMockKeypair() as never,
    });

    expect(result).toBe("tx_digest_123");
  });

  it("throws on failed transaction", async () => {
    const mockClient = makeMockClient({
      signAndExecuteTransaction: vi.fn().mockResolvedValue({
        digest: "tx_digest_fail",
        effects: { status: { status: "failure", error: "InsufficientGas" } },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await expect(
      executeAgentTransaction({
        transaction: makeMockTransaction() as never,
        agentKeypair: makeMockKeypair() as never,
      })
    ).rejects.toThrow("Agent TX failed: InsufficientGas");
  });

  it("throws with default message when error is missing", async () => {
    const mockClient = makeMockClient({
      signAndExecuteTransaction: vi.fn().mockResolvedValue({
        digest: "tx_digest_fail",
        effects: { status: { status: "failure" } },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await expect(
      executeAgentTransaction({
        transaction: makeMockTransaction() as never,
        agentKeypair: makeMockKeypair() as never,
      })
    ).rejects.toThrow("Transaction failed on-chain");
  });

  it("calls signAndExecuteTransaction with correct params", async () => {
    const signAndExecute = vi.fn().mockResolvedValue({
      digest: "ok",
      effects: { status: { status: "success" } },
    });
    const mockClient = makeMockClient({ signAndExecuteTransaction: signAndExecute });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const tx = makeMockTransaction();
    const keypair = makeMockKeypair();
    await executeAgentTransaction({ transaction: tx as never, agentKeypair: keypair as never });

    expect(signAndExecute).toHaveBeenCalledWith({
      transaction: tx,
      signer: keypair,
      options: { showEffects: true },
    });
  });
});

describe("executeSponsoredAgentTransaction", () => {
  const originalEnv = process.env.SPONSOR_PRIVATE_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SPONSOR_PRIVATE_KEY = originalEnv;
    } else {
      delete process.env.SPONSOR_PRIVATE_KEY;
    }
  });

  it("throws when SPONSOR_PRIVATE_KEY is missing", async () => {
    delete process.env.SPONSOR_PRIVATE_KEY;

    await expect(
      executeSponsoredAgentTransaction({
        transaction: makeMockTransaction() as never,
        agentKeypair: makeMockKeypair() as never,
      })
    ).rejects.toThrow("SPONSOR_PRIVATE_KEY is not set");
  });

  it("returns digest on successful sponsored transaction", async () => {
    process.env.SPONSOR_PRIVATE_KEY = "suiprivkey1test";

    const mockClient = makeMockClient({
      executeTransactionBlock: vi.fn().mockResolvedValue({
        digest: "sponsored_digest_456",
        effects: { status: { status: "success" } },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const result = await executeSponsoredAgentTransaction({
      transaction: makeMockTransaction() as never,
      agentKeypair: makeMockKeypair() as never,
    });

    expect(result).toBe("sponsored_digest_456");
  });

  it("throws on failed sponsored transaction", async () => {
    process.env.SPONSOR_PRIVATE_KEY = "suiprivkey1test";

    const mockClient = makeMockClient({
      executeTransactionBlock: vi.fn().mockResolvedValue({
        digest: "fail",
        effects: { status: { status: "failure", error: "PolicyViolation" } },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await expect(
      executeSponsoredAgentTransaction({
        transaction: makeMockTransaction() as never,
        agentKeypair: makeMockKeypair() as never,
      })
    ).rejects.toThrow("Sponsored agent TX failed: PolicyViolation");
  });

  it("sets sender and gas owner on the transaction", async () => {
    process.env.SPONSOR_PRIVATE_KEY = "suiprivkey1test";

    const mockClient = makeMockClient({
      executeTransactionBlock: vi.fn().mockResolvedValue({
        digest: "ok",
        effects: { status: { status: "success" } },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const tx = makeMockTransaction();
    await executeSponsoredAgentTransaction({
      transaction: tx as never,
      agentKeypair: makeMockKeypair() as never,
    });

    expect(tx.setSender).toHaveBeenCalledWith("0xagent_address");
    expect(tx.setGasOwner).toHaveBeenCalledWith("0xsponsor_address");
  });

  it("sends both agent and sponsor signatures", async () => {
    process.env.SPONSOR_PRIVATE_KEY = "suiprivkey1test";

    const executeBlock = vi.fn().mockResolvedValue({
      digest: "ok",
      effects: { status: { status: "success" } },
    });
    const mockClient = makeMockClient({ executeTransactionBlock: executeBlock });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await executeSponsoredAgentTransaction({
      transaction: makeMockTransaction() as never,
      agentKeypair: makeMockKeypair() as never,
    });

    expect(executeBlock).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: ["agent_sig", "sponsor_sig"],
        options: { showEffects: true },
      })
    );
  });
});
