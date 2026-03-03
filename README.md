# Suistody Core

Policy-based AI Agent custody SDK for Sui blockchain.

Suistody Core provides a TypeScript SDK and Move smart contracts for managing on-chain Vaults with configurable spending policies. AI Agents can autonomously withdraw funds within owner-defined constraints (budget limits, per-tx caps, action whitelists, cooldowns, expiry). Owners can pause/unpause vaults to temporarily restrict agent access.

- **SDK**: v0.3.0 -- 993 lines across 11 source files
- **Package**: suistody-core
- **Plugin**: v0.2.0 -- 14 tools
- **Move Contract**: 456 lines, 22 public functions, 24 tests

## Install

```bash
npm install
```

## Core API

### Vault Queries

```typescript
import {
  getVault,
  getOwnerCaps,
  getAgentCaps,
  getOwnedVaults,
  getVaultEvents,
} from './lib'

// Fetch vault data from chain (includes status field)
const vault = await getVault('0xvault_id')

// Fetch all vaults owned by an address
const vaults = await getOwnedVaults('0xowner_address')

// Fetch agent/owner capabilities
const agentCaps = await getAgentCaps('0xagent_address')
const ownerCaps = await getOwnerCaps('0xowner_address')

// Fetch withdrawal events (paginated)
const { events, nextCursor, hasMore } = await getVaultEvents('0xvault_id')

// Fetch next page
if (hasMore) {
  const page2 = await getVaultEvents('0xvault_id', nextCursor)
}
```

### Policy Check (Off-chain)

The policy checker validates vault status (paused/locked) before evaluating other policy rules.

```typescript
import { checkPolicy } from './lib'

const result = checkPolicy({
  vault,
  actionType: 0,       // ACTION_SWAP
  amount: 500_000_000n, // 0.5 SUI in MIST
  nowMs: Date.now(),
})

if (!result.allowed) {
  console.error(result.reason)
}
```

### PTB Builders (9 builders)

```typescript
import {
  buildCreateVault,
  buildDeposit,       // also: buildDepositFromGas (variant using gas coin)
  buildWithdrawAll,
  buildCreateAgentCap,
  buildRevokeAgentCap,
  buildAgentWithdraw,
  buildPause,
  buildUnpause,
  buildUpdatePolicy,
} from './lib'

// Owner: create a vault with policy
const createTx = buildCreateVault({
  depositAmount: 10_000_000_000n,
  maxBudget: 5_000_000_000n,
  maxPerTx: 1_000_000_000n,
  allowedActions: [0, 1, 2, 3],
  cooldownMs: 60_000n,
  expiresAt: BigInt(Date.now() + 86_400_000),
  useGasCoin: true,
})

// Owner: deposit additional funds
const depositTx = buildDeposit({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
  amount: 5_000_000_000n,
})

// Owner: withdraw all funds
const withdrawTx = buildWithdrawAll({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
})

// Owner: create an AgentCap for an agent
const agentCapTx = buildCreateAgentCap({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
  agentAddress: '0xagent_address',
})

// Owner: revoke an agent's access
const revokeTx = buildRevokeAgentCap({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
  agentCapId: '0xcap_id',
})

// Agent: withdraw funds within policy
const agentWithdrawTx = buildAgentWithdraw({
  vaultId: '0xvault_id',
  agentCapId: '0xcap_id',
  amount: 500_000_000n,
  actionType: 0,
  recipientAddress: '0xrecipient',
})

// Owner: update vault policy
const updateTx = buildUpdatePolicy({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
  maxBudget: 10_000_000_000n,
  maxPerTx: 2_000_000_000n,
  allowedActions: [0, 1, 2, 3],
  cooldownMs: 30_000n,
  expiresAt: BigInt(Date.now() + 172_800_000),
})
```

### Vault Status (Pause / Unpause)

Owners can pause and unpause vaults. A paused vault rejects all agent withdrawals.

```typescript
import { buildPause, buildUnpause } from './lib'
import { STATUS_ACTIVE, STATUS_PAUSED, STATUS_LOCKED } from './lib'

// Pause vault -- blocks agent withdrawals
const pauseTx = buildPause({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
})

// Unpause vault -- re-enables agent withdrawals
const unpauseTx = buildUnpause({
  vaultId: '0xvault_id',
  ownerCapId: '0xowner_cap_id',
})

// Status constants: STATUS_ACTIVE=0, STATUS_PAUSED=1, STATUS_LOCKED=2
```

### Transaction Execution

```typescript
import { executeAgentTransaction, executeSponsoredAgentTransaction } from './lib'
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519'

const agentKeypair = Ed25519Keypair.fromSecretKey(process.env.AGENT_PRIVATE_KEY!)

// Agent pays own gas
const digest = await executeAgentTransaction({ transaction: tx, agentKeypair })

// Sponsor pays gas (requires SPONSOR_PRIVATE_KEY env var)
const digest2 = await executeSponsoredAgentTransaction({ transaction: tx, agentKeypair })
```

### MultiSig Support

```typescript
import { deriveMultiSigAddress, buildMultiSigTransaction } from './lib'

// Derive a multi-sig address from public keys
const multiSigAddress = deriveMultiSigAddress({
  publicKeys: [pk1, pk2, pk3],
  threshold: 2,
})

// Build a transaction requiring multiple signatures
const multiSigTx = buildMultiSigTransaction({
  transaction: tx,
  publicKeys: [pk1, pk2, pk3],
  threshold: 2,
})
```

### Retry and Dry-Run Utilities

```typescript
import { withRetry, dryRunTransaction } from './lib'

// Retry with exponential backoff (3 retries, 1s-10s delay)
const result = await withRetry(() => riskyOperation())

// Dry-run a transaction before submitting (returns ok/fail + gas estimate)
const dryResult = await dryRunTransaction({ transaction: tx, sender: '0xaddress' })
if (dryResult.ok) {
  // dryResult.gasEstimate available
}
```

## Move Contract

The `contracts/` directory contains the `agent_vault` Move module (456 lines) deployed on Sui testnet.

### 22 Public Functions

**Vault Management:**
- `create_vault` -- Create a vault with deposit and policy
- `deposit` -- Owner deposits additional funds
- `withdraw_all` -- Owner withdraws all funds
- `withdraw` -- Owner withdraws specific amount
- `reset_counters` -- Owner resets spent/tx counters
- `pause` -- Owner pauses vault
- `unpause` -- Owner unpauses vault
- `update_policy` -- Owner updates vault policy

**Agent Operations:**
- `create_agent_cap` -- Mint an AgentCap for an agent address
- `revoke_agent_cap` -- Revoke an agent's access
- `agent_withdraw` -- Agent withdraws within policy constraints

**Read Functions (Getters):**
- `get_balance`, `get_total_spent`, `get_tx_count`, `get_owner`
- `get_policy_max_budget`, `get_policy_max_per_tx`, `get_policy_cooldown_ms`, `get_policy_expires_at`
- `get_status`, `get_agent_cap_vault_id`, `get_owner_cap_vault_id`

### 11 Error Constants

| Error | Code | Description |
|-------|------|-------------|
| `E_NOT_OWNER` | 0 | Caller is not the vault owner |
| `E_BUDGET_EXCEEDED` | 1 | Total budget exceeded |
| `E_NOT_WHITELISTED` | 2 | Action type not in whitelist |
| `E_EXPIRED` | 3 | Policy has expired |
| `E_COOLDOWN` | 4 | Cooldown period not elapsed |
| `E_INVALID_CAP` | 5 | AgentCap does not match vault |
| `E_INSUFFICIENT_BALANCE` | 6 | Vault balance insufficient |
| `E_PER_TX_EXCEEDED` | 7 | Per-transaction limit exceeded |
| `E_ZERO_AMOUNT` | 8 | Amount must be greater than zero |
| `E_VAULT_PAUSED` | 9 | Vault is paused |
| `E_INVALID_STATUS` | 10 | Invalid status transition |

### Key Design Decisions

- AgentCap has `key` only (NO `store`) -- prevents unauthorized transfer
- VaultData includes a `status` field (0=active, 1=paused, 2=locked)
- Uses `Balance<SUI>` for fund storage (not `Coin`)
- Shared Vault objects via `transfer::share_object`

```bash
cd contracts
sui move test    # 24 tests
sui move build
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `SUI_NETWORK` | `testnet`, `devnet`, or `mainnet` |
| `PACKAGE_ID` | Deployed Move contract Package ID |
| `AGENT_PRIVATE_KEY` | Agent Ed25519 private key (`suiprivkey1...`) |
| `SPONSOR_PRIVATE_KEY` | Sponsor Ed25519 private key (pays gas) |

## Unit Conversion

All amounts use MIST (1 SUI = 1,000,000,000 MIST):

```typescript
import { suiToMist, mistToSui } from './lib'

suiToMist(1)              // 1_000_000_000n
mistToSui(500_000_000n)   // 0.5
```

## Testing

```bash
npm test          # TypeScript unit tests (vitest)
npm run typecheck # TypeScript type checking
cd contracts && sui move test  # Move contract tests (24/24)
```

## License

MIT
