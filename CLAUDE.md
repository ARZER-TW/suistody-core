# Suistody Core - CLAUDE.md

## Repository

https://github.com/ARZER-TW/suistody-core

## Project Overview

Pure TypeScript SDK + Move smart contracts for policy-based AI Agent custody on Sui blockchain. Extracted from the full-stack agent-vault hackathon project -- no frontend, no LLM client, no zkLogin.

## Project Structure

```
contracts/              # Sui Move smart contracts
  sources/agent_vault.move
  sources/agent_vault_tests.move

lib/                    # TypeScript SDK
  index.ts              # Public API entry point
  constants.ts          # Package ID, action types, unit conversion
  vault/
    types.ts            # VaultData, Policy, AgentCapData, OwnerCapData, VaultEvent
    service.ts          # On-chain queries (getVault, getOwnerCaps, getAgentCaps)
    ptb-builder.ts      # PTB builders (createVault, deposit, withdraw, agentWithdraw)
  sui/
    client.ts           # SuiClient singleton
  agent/
    policy-checker.ts   # Off-chain policy pre-check
  auth/
    sponsored-tx.ts     # Agent + Sponsor dual-sign transaction execution
  __tests__/
    constants.test.ts
  agent/__tests__/
    policy-checker.test.ts
  vault/__tests__/
    ptb-builder.test.ts
    service.test.ts
```

## Development Commands

```bash
npm test             # Run all vitest tests
npm run typecheck    # TypeScript type checking
npm run build        # Build to dist/
cd contracts && sui move test  # Move contract tests (15/15)
```

## Development Rules

### SDK Version
- `@mysten/sui@^1.44.0` is the core dependency

### TypeScript
- All amounts use `bigint` (MIST units, 1 SUI = 1e9 MIST)
- Path alias: `@/` maps to project root
- Immutable patterns: no direct state mutation
- Use `zod` for external input validation

### Move Contract
- Uses `Balance<SUI>` for fund storage (not `Coin`)
- AgentCap has `key, store` abilities (transferable)
- Shared Vault objects via `transfer::share_object`
- Error codes: `const E_xxx: u64 = n`
- Overflow protection: subtraction check `amount <= max - spent`

### @mysten/sui API
- `SuiClient.getObject({ id, options: { showContent: true } })` for Move struct fields
- `SuiClient.getOwnedObjects({ owner, filter: { StructType: "pkg::mod::Type" } })`
- Move struct fields may be nested: `content.fields.field_name` or `content.fields.fields.field_name`
- `Balance<SUI>` nesting: `balance_sui.fields.value` or `balance_sui.value`

## Key Constants

```typescript
const CLOCK_OBJECT_ID = '0x6';
const ACTION_SWAP = 0;
const ACTION_STABLE_MINT = 1;
const ACTION_STABLE_BURN = 2;
const ACTION_STABLE_CLAIM = 3;
```

## Restrictions

- Never hardcode Package ID (use environment variables)
- Never skip policy check before executing transactions
- Never use `transfer::transfer` on shared objects in Move
