module agent_vault::agent_vault {
    use sui::balance::Balance;
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use sui::sui::SUI;
    use sui::event;

    // === Error Constants ===
    const E_NOT_OWNER: u64 = 0;
    const E_BUDGET_EXCEEDED: u64 = 1;
    const E_NOT_WHITELISTED: u64 = 2;
    const E_EXPIRED: u64 = 3;
    const E_COOLDOWN: u64 = 4;
    const E_INVALID_CAP: u64 = 5;
    const E_INSUFFICIENT_BALANCE: u64 = 6;
    const E_PER_TX_EXCEEDED: u64 = 7;
    const E_ZERO_AMOUNT: u64 = 8;

    // === Structs ===

    /// Vault: shared object holding funds with policy-based access control
    public struct Vault has key {
        id: UID,
        owner: address,
        balance_sui: Balance<SUI>,
        policy: Policy,
        authorized_caps: vector<ID>,
        total_spent: u64,
        last_tx_time: u64,
        tx_count: u64,
    }

    /// Policy: defines agent operation limits
    public struct Policy has store, copy, drop {
        max_budget: u64,
        max_per_tx: u64,
        allowed_actions: vector<u8>,
        cooldown_ms: u64,
        expires_at: u64,
    }

    /// AgentCap: agent's permission token (transferable NFT)
    public struct AgentCap has key, store {
        id: UID,
        vault_id: ID,
    }

    /// OwnerCap: vault owner's proof of ownership
    public struct OwnerCap has key, store {
        id: UID,
        vault_id: ID,
    }

    // === Events ===

    public struct VaultCreated has copy, drop {
        vault_id: ID,
        owner: address,
        initial_balance: u64,
        max_budget: u64,
    }

    public struct AgentWithdrawal has copy, drop {
        vault_id: ID,
        agent_cap_id: ID,
        amount: u64,
        action_type: u8,
        total_spent: u64,
        remaining_budget: u64,
        tx_count: u64,
        timestamp: u64,
    }

    public struct PolicyUpdated has copy, drop {
        vault_id: ID,
        max_budget: u64,
        max_per_tx: u64,
        cooldown_ms: u64,
        expires_at: u64,
    }

    public struct AgentCapCreated has copy, drop {
        vault_id: ID,
        cap_id: ID,
        agent_address: address,
    }

    public struct AgentCapRevoked has copy, drop {
        vault_id: ID,
        cap_id: ID,
    }

    public struct Deposited has copy, drop {
        vault_id: ID,
        amount: u64,
        new_balance: u64,
    }

    public struct WithdrawnAll has copy, drop {
        vault_id: ID,
        amount: u64,
    }

    // === Public Entry Functions ===

    /// Create a new Vault with initial deposit and policy
    #[allow(lint(self_transfer))]
    public fun create_vault(
        coin: Coin<SUI>,
        max_budget: u64,
        max_per_tx: u64,
        allowed_actions: vector<u8>,
        cooldown_ms: u64,
        expires_at: u64,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let vault_uid = object::new(ctx);
        let vault_id = vault_uid.to_inner();
        let initial_balance = coin.value();

        let vault = Vault {
            id: vault_uid,
            owner: ctx.sender(),
            balance_sui: coin.into_balance(),
            policy: Policy {
                max_budget,
                max_per_tx,
                allowed_actions,
                cooldown_ms,
                expires_at,
            },
            authorized_caps: vector::empty(),
            total_spent: 0,
            last_tx_time: 0,
            tx_count: 0,
        };

        let owner_cap = OwnerCap {
            id: object::new(ctx),
            vault_id,
        };

        event::emit(VaultCreated {
            vault_id,
            owner: ctx.sender(),
            initial_balance,
            max_budget,
        });

        transfer::share_object(vault);
        transfer::transfer(owner_cap, ctx.sender());
    }

    /// Owner deposits additional funds into Vault
    public fun deposit(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
        coin: Coin<SUI>,
    ) {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);
        let amount = coin.value();
        vault.balance_sui.join(coin.into_balance());

        event::emit(Deposited {
            vault_id: object::id(vault),
            amount,
            new_balance: vault.balance_sui.value(),
        });
    }

    /// Owner withdraws all funds from Vault
    public fun withdraw_all(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);
        let amount = vault.balance_sui.value();

        event::emit(WithdrawnAll {
            vault_id: object::id(vault),
            amount,
        });

        coin::from_balance(vault.balance_sui.split(amount), ctx)
    }

    /// Owner withdraws a specific amount from Vault
    public fun withdraw(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);
        assert!(amount > 0, E_ZERO_AMOUNT);
        assert!(vault.balance_sui.value() >= amount, E_INSUFFICIENT_BALANCE);
        coin::from_balance(vault.balance_sui.split(amount), ctx)
    }

    /// Owner resets spending counters
    public fun reset_counters(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
    ) {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);
        vault.total_spent = 0;
        vault.tx_count = 0;
        vault.last_tx_time = 0;
    }

    /// Owner updates policy rules
    public fun update_policy(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
        max_budget: u64,
        max_per_tx: u64,
        allowed_actions: vector<u8>,
        cooldown_ms: u64,
        expires_at: u64,
    ) {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);
        vault.policy = Policy {
            max_budget,
            max_per_tx,
            allowed_actions,
            cooldown_ms,
            expires_at,
        };

        event::emit(PolicyUpdated {
            vault_id: object::id(vault),
            max_budget,
            max_per_tx,
            cooldown_ms,
            expires_at,
        });
    }

    /// Owner creates an AgentCap for an agent address
    public fun create_agent_cap(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
        agent_address: address,
        ctx: &mut TxContext,
    ) {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);

        let cap_uid = object::new(ctx);
        let cap_id = cap_uid.to_inner();

        let agent_cap = AgentCap {
            id: cap_uid,
            vault_id: object::id(vault),
        };

        vault.authorized_caps.push_back(cap_id);

        event::emit(AgentCapCreated {
            vault_id: object::id(vault),
            cap_id,
            agent_address,
        });

        transfer::transfer(agent_cap, agent_address);
    }

    /// Owner revokes an agent's permission (by cap ID)
    public fun revoke_agent_cap(
        vault: &mut Vault,
        owner_cap: &OwnerCap,
        cap_id: ID,
    ) {
        assert!(owner_cap.vault_id == object::id(vault), E_NOT_OWNER);

        let (found, idx) = vault.authorized_caps.index_of(&cap_id);
        assert!(found, E_INVALID_CAP);
        vault.authorized_caps.remove(idx);

        event::emit(AgentCapRevoked {
            vault_id: object::id(vault),
            cap_id,
        });
    }

    /// Agent withdraws funds from Vault (checks all policy rules)
    public fun agent_withdraw(
        vault: &mut Vault,
        cap: &AgentCap,
        amount: u64,
        action_type: u8,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        // 0. Check non-zero amount
        assert!(amount > 0, E_ZERO_AMOUNT);

        // 1. Verify AgentCap belongs to this Vault
        assert!(cap.vault_id == object::id(vault), E_INVALID_CAP);

        // 2. Verify AgentCap is authorized (not revoked)
        let cap_id = object::id(cap);
        let (authorized, _) = vault.authorized_caps.index_of(&cap_id);
        assert!(authorized, E_INVALID_CAP);

        let now = clock.timestamp_ms();

        // 3. Check expiry
        assert!(now < vault.policy.expires_at, E_EXPIRED);

        // 4. Check cooldown (skip for first tx)
        if (vault.tx_count > 0) {
            assert!(now - vault.last_tx_time >= vault.policy.cooldown_ms, E_COOLDOWN);
        };

        // 5. Check per-tx limit
        assert!(amount <= vault.policy.max_per_tx, E_PER_TX_EXCEEDED);

        // 6. Check total budget (subtraction avoids overflow)
        assert!(amount <= vault.policy.max_budget - vault.total_spent, E_BUDGET_EXCEEDED);

        // 7. Check action whitelist
        assert!(vault.policy.allowed_actions.contains(&action_type), E_NOT_WHITELISTED);

        // 8. Check sufficient balance
        assert!(vault.balance_sui.value() >= amount, E_INSUFFICIENT_BALANCE);

        // 9. Update state
        vault.total_spent = vault.total_spent + amount;
        vault.last_tx_time = now;
        vault.tx_count = vault.tx_count + 1;

        event::emit(AgentWithdrawal {
            vault_id: object::id(vault),
            agent_cap_id: object::id(cap),
            amount,
            action_type,
            total_spent: vault.total_spent,
            remaining_budget: vault.policy.max_budget - vault.total_spent,
            tx_count: vault.tx_count,
            timestamp: now,
        });

        // 10. Extract and return funds
        coin::from_balance(vault.balance_sui.split(amount), ctx)
    }

    // === View Functions ===

    public fun get_balance(vault: &Vault): u64 {
        vault.balance_sui.value()
    }

    public fun get_total_spent(vault: &Vault): u64 {
        vault.total_spent
    }

    public fun get_tx_count(vault: &Vault): u64 {
        vault.tx_count
    }

    public fun get_owner(vault: &Vault): address {
        vault.owner
    }

    public fun get_policy_max_budget(vault: &Vault): u64 {
        vault.policy.max_budget
    }

    public fun get_policy_max_per_tx(vault: &Vault): u64 {
        vault.policy.max_per_tx
    }

    public fun get_policy_cooldown_ms(vault: &Vault): u64 {
        vault.policy.cooldown_ms
    }

    public fun get_policy_expires_at(vault: &Vault): u64 {
        vault.policy.expires_at
    }

    public fun get_agent_cap_vault_id(cap: &AgentCap): ID {
        cap.vault_id
    }

    public fun get_owner_cap_vault_id(cap: &OwnerCap): ID {
        cap.vault_id
    }
}
