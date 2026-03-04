# Suistody Core - CLAUDE.md

## Repository

https://github.com/ARZER-TW/suistody-core

## Project Overview

Pure TypeScript SDK (v0.4.0) + Move smart contracts for policy-based AI Agent custody on Sui blockchain. Extracted from the full-stack agent-vault hackathon project -- no frontend, no LLM client, no zkLogin.

- SDK: v0.4.0, 1613 lines across 13 source files
- Package: @suistody/core
- Plugin: v0.2.0, 17 tools
- Move contract: 456 lines, 22 public functions, 11 error constants, 24 tests

## Project Structure

```
contracts/              # Sui Move smart contracts
  sources/agent_vault.move
  sources/agent_vault_tests.move

lib/                    # TypeScript SDK (13 source files, 1613 lines)
  index.ts              # Public API barrel (42+ exports)
  config.ts             # Lazy config: initSuistody() for browser, process.env for Node.js
  constants.ts          # MODULE_NAME, CLOCK_OBJECT_ID, ACTION_*, STATUS_*, suiToMist/mistToSui, token types
  vault/
    types.ts            # VaultData (with status), Policy, AgentCapData, OwnerCapData, VaultEvent, PaginatedEvents
    service.ts          # getVault, getOwnerCaps, getAgentCaps, getOwnedVaults, getVaultEvents (paginated, retry)
    ptb-builder.ts      # 9 PTB builders: createVault, deposit, withdrawAll, createAgentCap, revokeAgentCap, agentWithdraw, pause, unpause, updatePolicy
  sui/
    client.ts           # SuiClient singleton (lazy init from config)
  agent/
    policy-checker.ts   # checkPolicy (off-chain, checks status + all policy rules)
  auth/
    sponsored-tx.ts     # executeAgentTransaction, executeSponsoredAgentTransaction
    multisig.ts         # deriveMultiSigAddress, buildMultiSigTransaction
  defi/
    oracle.ts           # Pyth Hermes HTTP API (getSuiUsdPrice, getTokenPrice, FEED_IDS)
    swap.ts             # Cetus CLMM swap (getSwapQuote, buildAgentSwap -- PTB composition)
    pool-discovery.ts   # findPool (Cetus API + hardcoded fallback)
  utils/
    retry.ts            # withRetry (exponential backoff, 3 retries, 1s-10s)
    dry-run.ts          # dryRunTransaction (DryRunResult: ok/fail + gas estimate)
  __tests__/
    constants.test.ts
  agent/__tests__/
    policy-checker.test.ts
  defi/__tests__/
    oracle.test.ts
    swap.test.ts
  vault/__tests__/
    ptb-builder.test.ts
    service.test.ts
```

## Development Commands

```bash
npm test             # Run all vitest tests
npm run typecheck    # TypeScript type checking
npm run build        # Build to dist/
cd contracts && sui move test  # Move contract tests (24/24)
```

## Development Rules

### SDK Version
- `@mysten/sui@^1.44.0` is the core dependency

### TypeScript
- All amounts use `bigint` (MIST units, 1 SUI = 1e9 MIST)
- Path alias: `@/` maps to project root
- Immutable patterns: no direct state mutation
- Use `zod` for external input validation

### Move Contract (456 lines, 22 public functions)
- Uses `Balance<SUI>` for fund storage (not `Coin`)
- AgentCap has `key` only (NO `store`) -- prevents unauthorized transfer
- VaultData has `status: number` field (0=active, 1=paused, 2=locked)
- Shared Vault objects via `transfer::share_object`
- Error codes: `const E_xxx: u64 = n` (11 error constants)
- Overflow protection: subtraction check `amount <= max - spent`

### @mysten/sui API
- `SuiClient.getObject({ id, options: { showContent: true } })` for Move struct fields
- `SuiClient.getOwnedObjects({ owner, filter: { StructType: "pkg::mod::Type" } })`
- Move struct fields may be nested: `content.fields.field_name` or `content.fields.fields.field_name`
- `Balance<SUI>` nesting: `balance_sui.fields.value` or `balance_sui.value`

## Move Contract -- 22 Public Functions

### Vault Management
- `create_vault` -- Create vault with deposit and policy
- `deposit` -- Owner deposits additional funds
- `withdraw_all` -- Owner withdraws all funds
- `withdraw` -- Owner withdraws specific amount
- `pause` -- Owner pauses vault (STATUS_PAUSED)
- `unpause` -- Owner unpauses vault (STATUS_ACTIVE)
- `reset_counters` -- Owner resets spent/tx counters
- `update_policy` -- Owner updates vault policy

### Agent Operations
- `create_agent_cap` -- Mint AgentCap for an agent address
- `revoke_agent_cap` -- Revoke an agent's access
- `agent_withdraw` -- Agent withdraws within policy constraints

### Read Functions (Getters)
- `get_balance` -- Vault balance
- `get_total_spent` -- Total amount spent
- `get_tx_count` -- Transaction count
- `get_owner` -- Vault owner address
- `get_policy_max_budget` -- Policy max budget
- `get_policy_max_per_tx` -- Policy per-tx limit
- `get_policy_cooldown_ms` -- Policy cooldown in ms
- `get_policy_expires_at` -- Policy expiry timestamp
- `get_status` -- Vault status (0/1/2)
- `get_agent_cap_vault_id` -- Vault ID from AgentCap
- `get_owner_cap_vault_id` -- Vault ID from OwnerCap

## Error Constants (11)

| Constant | Code | Description |
|----------|------|-------------|
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

## Status Constants

```typescript
const STATUS_ACTIVE = 0;
const STATUS_PAUSED = 1;
const STATUS_LOCKED = 2;
```

## Key Constants

```typescript
const CLOCK_OBJECT_ID = '0x6';
const ACTION_SWAP = 0;
const ACTION_STABLE_MINT = 1;
const ACTION_STABLE_BURN = 2;
const ACTION_STABLE_CLAIM = 3;
```

## SDK Key Features

### PTB Builders (9 builders in ptb-builder.ts)
- `buildCreateVault` -- Create vault with deposit + policy
- `buildDeposit` / `buildDepositFromGas` -- Deposit funds
- `buildWithdrawAll` -- Owner withdraw all
- `buildCreateAgentCap` -- Mint agent capability
- `buildRevokeAgentCap` -- Revoke agent capability
- `buildAgentWithdraw` -- Agent withdrawal
- `buildPause` -- Pause vault
- `buildUnpause` -- Unpause vault
- `buildUpdatePolicy` -- Update vault policy

### Policy Checker
- `checkPolicy` checks vault status (paused/locked) before evaluating other policy rules
- Off-chain pre-validation: budget, per-tx, cooldown, expiry, whitelist

### Paginated Events
- `getVaultEvents` returns `PaginatedEvents { events, nextCursor, hasMore }`

### MultiSig Support
- `deriveMultiSigAddress` -- Derive multi-sig address from public keys
- `buildMultiSigTransaction` -- Build transaction requiring multiple signatures

### DeFi Module (zero external SDK deps)
- **Oracle** (`defi/oracle.ts`): Pyth Hermes HTTP API -- `getSuiUsdPrice`, `getTokenPrice`, `FEED_IDS`
  - Mainnet: `hermes.pyth.network`, Testnet: `hermes-beta.pyth.network`
  - Per-network feed IDs (SUI/USD differs between mainnet/testnet)
- **Swap** (`defi/swap.ts`): Cetus CLMM via raw moveCall -- `getSwapQuote`, `buildAgentSwap`
  - PTB composition: agent_withdraw -> CLMM swap -> transfer (single transaction)
  - Token types: USDC addresses differ between mainnet/testnet
- **Pool Discovery** (`defi/pool-discovery.ts`): `findPool` via Cetus REST API + hardcoded fallback

### Utilities
- `withRetry` -- Exponential backoff (3 retries, 1s-10s)
- `dryRunTransaction` -- Returns `DryRunResult` (ok/fail + gas estimate)

### Configuration
- `initSuistody({ packageId, network })` -- Browser-safe initialization (no process.env)
- `getPackageId()` / `getNetwork()` -- Lazy getters
- Auto-detect from `process.env` in Node.js (backward compatible)

## Restrictions

- Never hardcode Package ID (use environment variables)
- Never skip policy check before executing transactions
- Never use `transfer::transfer` on shared objects in Move
- AgentCap has `key` only -- cannot be transferred via `transfer::public_transfer`
