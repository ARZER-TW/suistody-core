# Suistody Core

Policy-based AI Agent custody SDK for Sui blockchain.

Suistody Core provides a TypeScript SDK and Move smart contracts for managing on-chain Vaults with configurable spending policies. AI Agents can autonomously withdraw funds within owner-defined constraints (budget limits, per-tx caps, action whitelists, cooldowns, expiry).

## Install

```bash
npm install
```

## Core API

### Vault Queries

```typescript
import { getVault, getOwnerCaps, getAgentCaps, getOwnedVaults, getVaultEvents } from './lib'

// Fetch vault data from chain
const vault = await getVault('0xvault_id')

// Fetch all vaults owned by an address
const vaults = await getOwnedVaults('0xowner_address')

// Fetch agent/owner capabilities
const agentCaps = await getAgentCaps('0xagent_address')
const ownerCaps = await getOwnerCaps('0xowner_address')

// Fetch withdrawal events
const events = await getVaultEvents('0xvault_id')
```

### Policy Check (Off-chain)

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

### PTB Builders

```typescript
import { buildCreateVault, buildAgentWithdraw, buildDepositFromGas } from './lib'

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

// Agent: withdraw funds
const withdrawTx = buildAgentWithdraw({
  vaultId: '0xvault_id',
  agentCapId: '0xcap_id',
  amount: 500_000_000n,
  actionType: 0,
  recipientAddress: '0xrecipient',
})
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

## Move Contract

The `contracts/` directory contains the `agent_vault` Move module deployed on Sui testnet.

Key functions:
- `create_vault` -- Create a vault with deposit and policy
- `deposit` -- Owner deposits additional funds
- `withdraw_all` -- Owner withdraws all funds
- `create_agent_cap` -- Mint an AgentCap for an agent address
- `revoke_agent_cap` -- Revoke an agent's access
- `agent_withdraw` -- Agent withdraws within policy constraints
- `update_policy` -- Owner updates vault policy

```bash
cd contracts
sui move test    # 15 tests
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
cd contracts && sui move test  # Move contract tests
```

## License

MIT
