#[test_only]
module agent_vault::agent_vault_tests {
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin;
    use sui::sui::SUI;
    use sui::clock;
    use sui::test_utils;
    use agent_vault::agent_vault::{
        Self,
        Vault,
        AgentCap,
        OwnerCap,
    };

    // Test addresses
    const OWNER: address = @0xA;
    const AGENT: address = @0xB;
    // Test constants (in MIST: 1 SUI = 1_000_000_000 MIST)
    const ONE_SUI: u64 = 1_000_000_000;
    const TEN_SUI: u64 = 10_000_000_000;
    const HALF_SUI: u64 = 500_000_000;

    // Policy defaults for tests
    const DEFAULT_MAX_BUDGET: u64 = 5_000_000_000;    // 5 SUI
    const DEFAULT_MAX_PER_TX: u64 = 1_000_000_000;    // 1 SUI
    const DEFAULT_COOLDOWN_MS: u64 = 60_000;           // 60 seconds
    const DEFAULT_EXPIRES_AT: u64 = 999_999_999_999;   // far future

    // Action types
    const ACTION_SWAP: u8 = 0;
    const ACTION_LIMIT_ORDER: u8 = 1;

    // === Helper Functions ===

    fun setup_vault(scenario: &mut Scenario) {
        ts::next_tx(scenario, OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let coin = coin::mint_for_testing<SUI>(TEN_SUI, ts::ctx(scenario));
            let allowed_actions = vector[ACTION_SWAP];

            agent_vault::create_vault(
                coin,
                DEFAULT_MAX_BUDGET,
                DEFAULT_MAX_PER_TX,
                allowed_actions,
                DEFAULT_COOLDOWN_MS,
                DEFAULT_EXPIRES_AT,
                &clock,
                ts::ctx(scenario),
            );

            clock::destroy_for_testing(clock);
        };
    }

    fun setup_vault_with_agent(scenario: &mut Scenario) {
        setup_vault(scenario);

        // Create AgentCap
        ts::next_tx(scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(scenario);

            agent_vault::create_agent_cap(
                &mut vault,
                &owner_cap,
                AGENT,
                ts::ctx(scenario),
            );

            ts::return_shared(vault);
            ts::return_to_sender(scenario, owner_cap);
        };
    }

    // === Test: create_vault ===

    #[test]
    fun test_create_vault() {
        let mut scenario = ts::begin(OWNER);

        setup_vault(&mut scenario);

        // Verify Vault was created and shared
        ts::next_tx(&mut scenario, OWNER);
        {
            let vault = ts::take_shared<Vault>(&scenario);

            assert!(agent_vault::get_balance(&vault) == TEN_SUI);
            assert!(agent_vault::get_owner(&vault) == OWNER);
            assert!(agent_vault::get_total_spent(&vault) == 0);
            assert!(agent_vault::get_tx_count(&vault) == 0);
            assert!(agent_vault::get_policy_max_budget(&vault) == DEFAULT_MAX_BUDGET);
            assert!(agent_vault::get_policy_max_per_tx(&vault) == DEFAULT_MAX_PER_TX);
            assert!(agent_vault::get_policy_cooldown_ms(&vault) == DEFAULT_COOLDOWN_MS);
            assert!(agent_vault::get_policy_expires_at(&vault) == DEFAULT_EXPIRES_AT);

            ts::return_shared(vault);
        };

        // Verify OwnerCap was transferred to owner
        ts::next_tx(&mut scenario, OWNER);
        {
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
            ts::return_to_sender(&scenario, owner_cap);
        };

        ts::end(scenario);
    }

    // === Test: deposit ===

    #[test]
    fun test_deposit() {
        let mut scenario = ts::begin(OWNER);

        setup_vault(&mut scenario);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);
            let coin = coin::mint_for_testing<SUI>(ONE_SUI, ts::ctx(&mut scenario));

            agent_vault::deposit(&mut vault, &owner_cap, coin);

            assert!(agent_vault::get_balance(&vault) == TEN_SUI + ONE_SUI);

            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        ts::end(scenario);
    }

    // === Test: withdraw_all ===

    #[test]
    fun test_withdraw_all() {
        let mut scenario = ts::begin(OWNER);

        setup_vault(&mut scenario);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);

            let coin = agent_vault::withdraw_all(
                &mut vault,
                &owner_cap,
                ts::ctx(&mut scenario),
            );

            assert!(coin::value(&coin) == TEN_SUI);
            assert!(agent_vault::get_balance(&vault) == 0);

            test_utils::destroy(coin);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        ts::end(scenario);
    }

    // === Test: create_agent_cap ===

    #[test]
    fun test_create_agent_cap() {
        let mut scenario = ts::begin(OWNER);

        setup_vault(&mut scenario);

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);

            agent_vault::create_agent_cap(
                &mut vault,
                &owner_cap,
                AGENT,
                ts::ctx(&mut scenario),
            );

            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        // Verify AgentCap was transferred to agent
        ts::next_tx(&mut scenario, AGENT);
        {
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw (happy path) ===

    #[test]
    fun test_agent_withdraw_success() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));

            let coin = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            assert!(coin::value(&coin) == HALF_SUI);
            assert!(agent_vault::get_balance(&vault) == TEN_SUI - HALF_SUI);
            assert!(agent_vault::get_total_spent(&vault) == HALF_SUI);
            assert!(agent_vault::get_tx_count(&vault) == 1);

            test_utils::destroy(coin);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - budget exceeded ===

    #[test]
    #[expected_failure(abort_code = 1, location = agent_vault)]
    fun test_agent_withdraw_budget_exceeded() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        // Try to withdraw more than max_budget (5 SUI) in total
        // First withdraw 4 SUI (within budget)
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

            let coin1 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            // Advance clock past cooldown
            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS + 1);

            let coin2 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS + 1);

            let coin3 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS + 1);

            let coin4 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS + 1);

            let coin5 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS + 1);

            // This 6th withdrawal should fail: total_spent (5 SUI) + 1 SUI > max_budget (5 SUI)
            let coin6 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin1);
            test_utils::destroy(coin2);
            test_utils::destroy(coin3);
            test_utils::destroy(coin4);
            test_utils::destroy(coin5);
            test_utils::destroy(coin6);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - per-tx limit exceeded ===

    #[test]
    #[expected_failure(abort_code = 7, location = agent_vault)]
    fun test_agent_withdraw_per_tx_exceeded() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));

            // Try to withdraw 2 SUI (max_per_tx is 1 SUI)
            let coin = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                2 * ONE_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - expired ===

    #[test]
    #[expected_failure(abort_code = 3, location = agent_vault)]
    fun test_agent_withdraw_expired() {
        let mut scenario = ts::begin(OWNER);

        // Create vault with short expiry
        ts::next_tx(&mut scenario, OWNER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let coin = coin::mint_for_testing<SUI>(TEN_SUI, ts::ctx(&mut scenario));
            let allowed_actions = vector[ACTION_SWAP];

            agent_vault::create_vault(
                coin,
                DEFAULT_MAX_BUDGET,
                DEFAULT_MAX_PER_TX,
                allowed_actions,
                DEFAULT_COOLDOWN_MS,
                1_000,  // Expires at 1000ms
                &clock,
                ts::ctx(&mut scenario),
            );

            clock::destroy_for_testing(clock);
        };

        // Create agent cap
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);

            agent_vault::create_agent_cap(
                &mut vault,
                &owner_cap,
                AGENT,
                ts::ctx(&mut scenario),
            );

            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        // Try to withdraw after expiry
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

            // Advance clock past expiry
            clock::increment_for_testing(&mut clock, 2_000);

            let coin = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - cooldown not met ===

    #[test]
    #[expected_failure(abort_code = 4, location = agent_vault)]
    fun test_agent_withdraw_cooldown() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));
            // Start clock at a non-zero time so last_tx_time > 0 after first withdrawal
            clock::increment_for_testing(&mut clock, 100_000);

            // First withdrawal succeeds
            let coin1 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            // Advance clock but NOT past cooldown
            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS - 1);

            // Second withdrawal should fail due to cooldown
            let coin2 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin1);
            test_utils::destroy(coin2);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - action not whitelisted ===

    #[test]
    #[expected_failure(abort_code = 2, location = agent_vault)]
    fun test_agent_withdraw_not_whitelisted() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));

            // Try action_type 1 (limit_order) but only swap (0) is allowed
            let coin = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_LIMIT_ORDER,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - invalid cap (revoked) ===

    #[test]
    #[expected_failure(abort_code = 5, location = agent_vault)]
    fun test_agent_withdraw_revoked_cap() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        // Get the AgentCap ID first
        let cap_id;
        ts::next_tx(&mut scenario, AGENT);
        {
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            cap_id = object::id(&agent_cap);
            ts::return_to_sender(&scenario, agent_cap);
        };

        // Owner revokes the agent cap
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);

            agent_vault::revoke_agent_cap(&mut vault, &owner_cap, cap_id);

            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        // Agent tries to withdraw with revoked cap
        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));

            let coin = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: revoke_agent_cap ===

    #[test]
    fun test_revoke_agent_cap() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        // Get the AgentCap ID
        let cap_id;
        ts::next_tx(&mut scenario, AGENT);
        {
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            cap_id = object::id(&agent_cap);
            ts::return_to_sender(&scenario, agent_cap);
        };

        // Owner revokes
        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);

            agent_vault::revoke_agent_cap(&mut vault, &owner_cap, cap_id);

            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        ts::end(scenario);
    }

    // === Test: update_policy ===

    #[test]
    fun test_update_policy() {
        let mut scenario = ts::begin(OWNER);

        setup_vault(&mut scenario);

        let new_max_budget: u64 = 20_000_000_000;  // 20 SUI
        let new_max_per_tx: u64 = 5_000_000_000;   // 5 SUI
        let new_cooldown_ms: u64 = 120_000;          // 120 seconds
        let new_expires_at: u64 = 2_000_000_000_000;

        ts::next_tx(&mut scenario, OWNER);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let owner_cap = ts::take_from_sender<OwnerCap>(&scenario);

            agent_vault::update_policy(
                &mut vault,
                &owner_cap,
                new_max_budget,
                new_max_per_tx,
                vector[ACTION_SWAP, ACTION_LIMIT_ORDER],
                new_cooldown_ms,
                new_expires_at,
            );

            assert!(agent_vault::get_policy_max_budget(&vault) == new_max_budget);
            assert!(agent_vault::get_policy_max_per_tx(&vault) == new_max_per_tx);
            assert!(agent_vault::get_policy_cooldown_ms(&vault) == new_cooldown_ms);
            assert!(agent_vault::get_policy_expires_at(&vault) == new_expires_at);

            ts::return_shared(vault);
            ts::return_to_sender(&scenario, owner_cap);
        };

        ts::end(scenario);
    }

    // === Test: agent_withdraw - zero amount ===

    #[test]
    #[expected_failure(abort_code = 8, location = agent_vault)]
    fun test_agent_withdraw_zero_amount() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));

            let coin = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                0,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            test_utils::destroy(coin);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }

    // === Test: multiple agent withdrawals with cooldown ===

    #[test]
    fun test_agent_withdraw_multiple_with_cooldown() {
        let mut scenario = ts::begin(OWNER);

        setup_vault_with_agent(&mut scenario);

        ts::next_tx(&mut scenario, AGENT);
        {
            let mut vault = ts::take_shared<Vault>(&scenario);
            let agent_cap = ts::take_from_sender<AgentCap>(&scenario);
            let mut clock = clock::create_for_testing(ts::ctx(&mut scenario));

            // First withdrawal
            let coin1 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            // Advance past cooldown
            clock::increment_for_testing(&mut clock, DEFAULT_COOLDOWN_MS + 1);

            // Second withdrawal should succeed
            let coin2 = agent_vault::agent_withdraw(
                &mut vault,
                &agent_cap,
                HALF_SUI,
                ACTION_SWAP,
                &clock,
                ts::ctx(&mut scenario),
            );

            assert!(agent_vault::get_total_spent(&vault) == ONE_SUI);
            assert!(agent_vault::get_tx_count(&vault) == 2);

            test_utils::destroy(coin1);
            test_utils::destroy(coin2);
            clock::destroy_for_testing(clock);
            ts::return_shared(vault);
            ts::return_to_sender(&scenario, agent_cap);
        };

        ts::end(scenario);
    }
}
