import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock SuiClient before importing service
vi.mock("../../sui/client", () => ({
  getSuiClient: vi.fn(),
}));

// We test the internal helpers by importing them indirectly through the module.
// Since unwrapFields and extractFields are not exported, we re-implement the
// same logic in tests to validate the parsing behavior via getVault / getOwnedVaults.
import { getVault, getOwnerCaps, getAgentCaps, getOwnedVaults, getVaultEvents } from "../service";
import { getSuiClient } from "../../sui/client";

function makeMockClient(overrides: Record<string, unknown> = {}) {
  return {
    getObject: vi.fn(),
    getOwnedObjects: vi.fn(),
    multiGetObjects: vi.fn(),
    queryEvents: vi.fn(),
    ...overrides,
  };
}

const VAULT_FIELDS_FLAT = {
  owner: "0xowner_address",
  balance_sui: { value: "5000000000" },
  policy: {
    max_budget: "10000000000",
    max_per_tx: "1000000000",
    allowed_actions: [0],
    cooldown_ms: "60000",
    expires_at: "1700000000000",
  },
  authorized_caps: ["0xcap1", "0xcap2"],
  total_spent: "2000000000",
  last_tx_time: "1699999000000",
  tx_count: "3",
};

const VAULT_FIELDS_NESTED = {
  owner: "0xowner_address",
  balance_sui: { fields: { value: "5000000000" } },
  policy: {
    fields: {
      max_budget: "10000000000",
      max_per_tx: "1000000000",
      allowed_actions: [0],
      cooldown_ms: "60000",
      expires_at: "1700000000000",
    },
  },
  authorized_caps: ["0xcap1"],
  total_spent: "0",
  last_tx_time: "0",
  tx_count: "0",
};

describe("getVault", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("parses vault with flat field format", async () => {
    const mockClient = makeMockClient({
      getObject: vi.fn().mockResolvedValue({
        data: {
          content: {
            dataType: "moveObject",
            fields: VAULT_FIELDS_FLAT,
          },
        },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const vault = await getVault("0xvault123");
    expect(vault.id).toBe("0xvault123");
    expect(vault.owner).toBe("0xowner_address");
    expect(vault.balance).toBe(5_000_000_000n);
    expect(vault.policy.maxBudget).toBe(10_000_000_000n);
    expect(vault.policy.maxPerTx).toBe(1_000_000_000n);
    expect(vault.policy.allowedActions).toEqual([0]);
    expect(vault.policy.cooldownMs).toBe(60000);
    expect(vault.totalSpent).toBe(2_000_000_000n);
    expect(vault.txCount).toBe(3);
  });

  it("parses vault with nested fields format", async () => {
    const mockClient = makeMockClient({
      getObject: vi.fn().mockResolvedValue({
        data: {
          content: {
            dataType: "moveObject",
            fields: VAULT_FIELDS_NESTED,
          },
        },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const vault = await getVault("0xvault_nested");
    expect(vault.balance).toBe(5_000_000_000n);
    expect(vault.policy.maxBudget).toBe(10_000_000_000n);
    expect(vault.totalSpent).toBe(0n);
  });

  it("throws when vault not found", async () => {
    const mockClient = makeMockClient({
      getObject: vi.fn().mockResolvedValue({ data: null }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await expect(getVault("0xnonexistent")).rejects.toThrow("Vault not found");
  });

  it("throws when content is missing", async () => {
    const mockClient = makeMockClient({
      getObject: vi.fn().mockResolvedValue({
        data: { content: null },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await expect(getVault("0xno_content")).rejects.toThrow("Vault not found");
  });

  it("throws on non-moveObject dataType", async () => {
    const mockClient = makeMockClient({
      getObject: vi.fn().mockResolvedValue({
        data: {
          content: { dataType: "package", fields: {} },
        },
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    await expect(getVault("0xpackage")).rejects.toThrow("Expected moveObject");
  });
});

describe("getOwnerCaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no caps found", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const caps = await getOwnerCaps("0xowner");
    expect(caps).toEqual([]);
  });

  it("parses owner caps with string vault_id", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: "0xcap1",
              content: {
                dataType: "moveObject",
                fields: { vault_id: "0xvault_a" },
              },
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const caps = await getOwnerCaps("0xowner");
    expect(caps).toHaveLength(1);
    expect(caps[0].id).toBe("0xcap1");
    expect(caps[0].vaultId).toBe("0xvault_a");
  });

  it("parses owner caps with nested vault_id object", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: "0xcap2",
              content: {
                dataType: "moveObject",
                fields: { vault_id: { id: "0xvault_b" } },
              },
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const caps = await getOwnerCaps("0xowner");
    expect(caps[0].vaultId).toBe("0xvault_b");
  });

  it("paginates through multiple pages", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi
        .fn()
        .mockResolvedValueOnce({
          data: [
            {
              data: {
                objectId: "0xcap_page1",
                content: {
                  dataType: "moveObject",
                  fields: { vault_id: "0xvault1" },
                },
              },
            },
          ],
          hasNextPage: true,
          nextCursor: "cursor1",
        })
        .mockResolvedValueOnce({
          data: [
            {
              data: {
                objectId: "0xcap_page2",
                content: {
                  dataType: "moveObject",
                  fields: { vault_id: "0xvault2" },
                },
              },
            },
          ],
          hasNextPage: false,
          nextCursor: null,
        }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const caps = await getOwnerCaps("0xowner");
    expect(caps).toHaveLength(2);
    expect(caps[0].id).toBe("0xcap_page1");
    expect(caps[1].id).toBe("0xcap_page2");
  });
});

describe("getAgentCaps", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no agent caps", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const caps = await getAgentCaps("0xagent");
    expect(caps).toEqual([]);
  });

  it("parses agent caps correctly", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: "0xagent_cap",
              content: {
                dataType: "moveObject",
                fields: { vault_id: "0xvault_for_agent" },
              },
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const caps = await getAgentCaps("0xagent");
    expect(caps).toHaveLength(1);
    expect(caps[0].vaultId).toBe("0xvault_for_agent");
  });
});

describe("getOwnedVaults", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when owner has no caps", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [],
        hasNextPage: false,
        nextCursor: null,
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const vaults = await getOwnedVaults("0xowner_no_caps");
    expect(vaults).toEqual([]);
  });

  it("fetches vaults via owner caps", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: "0xcap",
              content: {
                dataType: "moveObject",
                fields: { vault_id: "0xvault_owned" },
              },
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      }),
      multiGetObjects: vi.fn().mockResolvedValue([
        {
          data: {
            objectId: "0xvault_owned",
            content: {
              dataType: "moveObject",
              fields: {
                owner: "0xowner",
                balance_sui: { value: "1000000000" },
                policy: {
                  max_budget: "5000000000",
                  max_per_tx: "500000000",
                  allowed_actions: [0],
                  cooldown_ms: "30000",
                  expires_at: "9999999999999",
                },
                authorized_caps: [],
                total_spent: "0",
                last_tx_time: "0",
                tx_count: "0",
              },
            },
          },
        },
      ]),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const vaults = await getOwnedVaults("0xowner");
    expect(vaults).toHaveLength(1);
    expect(vaults[0].id).toBe("0xvault_owned");
    expect(vaults[0].balance).toBe(1_000_000_000n);
  });

  it("skips vaults with missing content", async () => {
    const mockClient = makeMockClient({
      getOwnedObjects: vi.fn().mockResolvedValue({
        data: [
          {
            data: {
              objectId: "0xcap",
              content: {
                dataType: "moveObject",
                fields: { vault_id: "0xvault_missing" },
              },
            },
          },
        ],
        hasNextPage: false,
        nextCursor: null,
      }),
      multiGetObjects: vi.fn().mockResolvedValue([
        { data: null },
      ]),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const vaults = await getOwnedVaults("0xowner");
    expect(vaults).toEqual([]);
  });
});

describe("getVaultEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns filtered events matching the vault_id", async () => {
    const mockClient = makeMockClient({
      queryEvents: vi.fn().mockResolvedValue({
        data: [
          {
            id: { txDigest: "tx1" },
            parsedJson: {
              vault_id: "0xvault_target",
              amount: "500000000",
              action_type: "0",
              total_spent: "500000000",
              remaining_budget: "4500000000",
              tx_count: "1",
              timestamp: "1700000000000",
            },
          },
          {
            id: { txDigest: "tx2" },
            parsedJson: {
              vault_id: "0xother_vault",
              amount: "100000000",
              action_type: "1",
              total_spent: "100000000",
              remaining_budget: "900000000",
              tx_count: "1",
              timestamp: "1700000001000",
            },
          },
        ],
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const events = await getVaultEvents("0xvault_target");
    expect(events).toHaveLength(1);
    expect(events[0].txDigest).toBe("tx1");
    expect(events[0].amount).toBe(500_000_000n);
    expect(events[0].totalSpent).toBe(500_000_000n);
    expect(events[0].remainingBudget).toBe(4_500_000_000n);
    expect(events[0].txCount).toBe(1);
    expect(events[0].timestamp).toBe(1700000000000);
  });

  it("returns empty array when no matching events", async () => {
    const mockClient = makeMockClient({
      queryEvents: vi.fn().mockResolvedValue({
        data: [
          {
            id: { txDigest: "tx1" },
            parsedJson: {
              vault_id: "0xother",
              amount: "100",
              action_type: "0",
              total_spent: "100",
              remaining_budget: "900",
              tx_count: "1",
              timestamp: "1000",
            },
          },
        ],
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const events = await getVaultEvents("0xno_match");
    expect(events).toEqual([]);
  });

  it("returns empty array when queryEvents returns no data", async () => {
    const mockClient = makeMockClient({
      queryEvents: vi.fn().mockResolvedValue({ data: [] }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const events = await getVaultEvents("0xvault");
    expect(events).toEqual([]);
  });

  it("maps parsedJson fields correctly to VaultEvent", async () => {
    const mockClient = makeMockClient({
      queryEvents: vi.fn().mockResolvedValue({
        data: [
          {
            id: { txDigest: "digest_abc" },
            parsedJson: {
              vault_id: "0xmy_vault",
              amount: "1000000000",
              action_type: "2",
              total_spent: "3000000000",
              remaining_budget: "2000000000",
              tx_count: "5",
              timestamp: "1700001234567",
            },
          },
        ],
      }),
    });
    vi.mocked(getSuiClient).mockReturnValue(mockClient as never);

    const events = await getVaultEvents("0xmy_vault");
    expect(events).toHaveLength(1);
    expect(events[0]).toEqual({
      txDigest: "digest_abc",
      amount: 1_000_000_000n,
      actionType: 2,
      totalSpent: 3_000_000_000n,
      remainingBudget: 2_000_000_000n,
      txCount: 5,
      timestamp: 1700001234567,
    });
  });
});
