# Suistody Core -- Development Guide

> SDK development workflow, testing, and environment setup

**Last Updated:** 2026-02-28

---

## Prerequisites

| Tool       | Version  | Purpose                          | Install                                |
|------------|----------|----------------------------------|----------------------------------------|
| Node.js    | >= 18    | JavaScript runtime               | https://nodejs.org/                    |
| npm        | >= 9     | Package manager                  | Bundled with Node.js                   |
| Sui CLI    | latest   | Move contract build/deploy/test  | https://docs.sui.io/build/install      |
| TypeScript | >= 5     | Type checking (included in devDeps) | Installed via npm                  |

### Optional

| Tool              | Purpose                                     |
|-------------------|---------------------------------------------|
| Sui Testnet Faucet | Fund Sponsor/Agent wallets with test SUI   |

---

## Environment Setup

### 1. Clone and Install

```bash
git clone https://github.com/ARZER-TW/suistody-core.git
cd suistody-core
npm install
```

### 2. Environment Variables

```bash
cp .env.example .env
```

| Variable              | Required | Description                                      |
|-----------------------|----------|--------------------------------------------------|
| `SUI_NETWORK`         | Yes      | Sui network: `testnet` (default), `devnet`, or `mainnet` |
| `PACKAGE_ID`          | Yes      | Deployed Move contract Package ID                |
| `AGENT_PRIVATE_KEY`   | Yes      | Agent Ed25519 private key (`suiprivkey1...`)      |
| `SPONSOR_PRIVATE_KEY` | Yes      | Sponsor Ed25519 private key (pays gas)            |

**Security Warning**: `.env` is listed in `.gitignore`. Never commit private keys to version control.

### 3. Generate Wallet Keys

Sponsor and Agent wallets need testnet SUI:

```bash
# Generate a new Ed25519 keypair
sui keytool generate ed25519

# Fund from Sui Testnet faucet
sui client faucet --address <YOUR_ADDRESS>
```

---

## Available Scripts

| Command              | Description                              |
|----------------------|------------------------------------------|
| `npm test`           | Run all TypeScript unit tests (vitest)   |
| `npm run test:watch` | Watch mode unit tests                    |
| `npm run build`      | Build TypeScript to dist/                |
| `npm run typecheck`  | TypeScript type checking (no emit)       |

### Move Contract Commands

```bash
cd contracts

# Build
sui move build

# Test (15 tests)
sui move test

# Deploy to Testnet
sui client publish --gas-budget 100000000

# After deployment, update PACKAGE_ID in .env
```

---

## Development Workflow

### Git Workflow

```bash
# Commit format
git add <specific-files>
git commit -m "type: description"
git push

# Types: feat, fix, docs, refactor, test, chore
```

### Development Cycle

1. Make code changes
2. Run tests: `npm test`
3. Type check: `npm run typecheck`
4. Commit and push

---

## Testing

### TypeScript Tests (Vitest)

| Test File                   | Tests | Coverage Area                                    |
|-----------------------------|-------|--------------------------------------------------|
| `policy-checker.test.ts`    | 14    | All 6 policy rules boundary conditions + non-withdrawal actions |
| `constants.test.ts`         | 11    | suiToMist and mistToSui unit conversion          |
| `ptb-builder.test.ts`       | 13    | Owner PTB builders (create vault, deposit, withdraw, agent ops) |
| `service.test.ts`           | 14    | On-chain vault queries, owner/agent caps, pagination |

### Move Contract Tests (15/15 passing)

```bash
cd contracts
sui move test
```

Tests cover all contract functions and all 9 error code trigger conditions:

- `test_create_vault` -- Vault creation with initial deposit and policy
- `test_deposit` -- Owner deposits additional funds
- `test_withdraw_all` -- Owner withdraws all funds
- `test_create_agent_cap` -- Minting AgentCap to agent address
- `test_agent_withdraw_success` -- Happy-path agent withdrawal
- `test_agent_withdraw_budget_exceeded` -- Total budget enforcement
- `test_agent_withdraw_per_tx_exceeded` -- Per-transaction limit enforcement
- `test_agent_withdraw_expired` -- Expiry enforcement
- `test_agent_withdraw_cooldown` -- Cooldown enforcement
- `test_agent_withdraw_not_whitelisted` -- Action whitelist enforcement
- `test_agent_withdraw_revoked_cap` -- Revoked cap rejection
- `test_revoke_agent_cap` -- Cap revocation flow
- `test_update_policy` -- Policy update with new parameters
- `test_agent_withdraw_zero_amount` -- Zero amount rejection
- `test_agent_withdraw_multiple_with_cooldown` -- Multi-withdrawal with cooldown respect

---

## Code Conventions

### TypeScript

- All monetary amounts use `bigint`, never `number`
- Use `zod` to validate all external inputs
- Path alias: `@/` maps to project root
- Immutable patterns: no direct state mutation
- Unit conversion helpers in `lib/constants.ts`: `suiToMist()`, `mistToSui()`

### Move

- Error code constants: `const E_xxx: u64 = n`
- Use `public(package)` for cross-module internal functions
- Shared objects: `transfer::share_object`
- Owned objects: `transfer::transfer`
- Fund storage: `Balance<SUI>` (not `Coin`)

---

## Adding a New Policy Rule

1. Add field to `Policy` struct in `contracts/sources/agent_vault.move`
2. Add validation logic in `agent_withdraw` function
3. Add positive and negative tests in `agent_vault_tests.move`
4. Update `Policy` interface in `lib/vault/types.ts`
5. Add corresponding off-chain check in `lib/agent/policy-checker.ts`
6. Add tests in `lib/agent/__tests__/policy-checker.test.ts`
7. Add field parsing in `lib/vault/service.ts` (`parsePolicy`)
8. Add parameter in `lib/vault/ptb-builder.ts` (`buildCreateVault`)

---

## Troubleshooting

### "SPONSOR_PRIVATE_KEY is not set"

Confirm `.env` contains `SPONSOR_PRIVATE_KEY` with a valid Sui private key format (`suiprivkey1...`).

### "Vault not found: 0x..."

Vault ID may be from a different network (devnet vs testnet). Confirm `SUI_NETWORK` is correct.

### Move contract build fails

Confirm Sui CLI version is compatible with `edition = "2024.beta"`. Check with `sui --version`.

---

## Related Documentation

- [README.md](../README.md) -- Project overview
- [CLAUDE.md](../CLAUDE.md) -- Claude Code working guidelines
