//! TESTNET ONLY. A mock USDC: standard NEP-141 + NEP-145 from near-contract-standards,
//! 6 decimals, and an open `mint` so anyone can get test tokens. Never deploy to mainnet.

use near_contract_standards::fungible_token::metadata::{
    FungibleTokenMetadata, FungibleTokenMetadataProvider, FT_METADATA_SPEC,
};
use near_contract_standards::fungible_token::{
    FungibleToken, FungibleTokenCore, FungibleTokenResolver,
};
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::U128;
use near_sdk::{env, near, require, AccountId, NearToken, PanicOnDefault, PromiseOrValue};

/// Max tokens per mint call: 1,000 mUSDC (6 decimals).
const MAX_MINT: u128 = 1_000_000_000;

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockFt {
    token: FungibleToken,
}

#[near]
impl MockFt {
    #[init]
    pub fn new() -> Self {
        Self { token: FungibleToken::new(b"t".to_vec()) }
    }

    /// Open faucet: mints up to 1,000 mUSDC to `account_id`, registering it if needed.
    /// Registration storage is paid by the caller's attached deposit when the account is new.
    #[payable]
    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        require!(amount.0 > 0 && amount.0 <= MAX_MINT, "amount must be 1..=1000 mUSDC");
        if !self.token.accounts.contains_key(&account_id) {
            let min = self.storage_balance_bounds().min;
            require!(env::attached_deposit() >= min, "attach storage deposit to register a new account");
            self.token.internal_register_account(&account_id);
        }
        self.token.internal_deposit(&account_id, amount.0);
        near_contract_standards::fungible_token::events::FtMint {
            owner_id: &account_id,
            amount: amount,
            memo: Some("testnet faucet"),
        }
        .emit();
    }
}

#[near]
impl FungibleTokenCore for MockFt {
    #[payable]
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        self.token.ft_transfer(receiver_id, amount, memo)
    }

    #[payable]
    fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<U128> {
        self.token.ft_transfer_call(receiver_id, amount, memo, msg)
    }

    fn ft_total_supply(&self) -> U128 {
        self.token.ft_total_supply()
    }

    fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        self.token.ft_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenResolver for MockFt {
    #[private]
    fn ft_resolve_transfer(&mut self, sender_id: AccountId, receiver_id: AccountId, amount: U128) -> U128 {
        let (used, _burned) = self.token.internal_ft_resolve_transfer(&sender_id, receiver_id, amount);
        used.into()
    }
}

#[near]
impl StorageManagement for MockFt {
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        self.token.storage_deposit(account_id, registration_only)
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        self.token.storage_withdraw(amount)
    }

    #[payable]
    fn storage_unregister(&mut self, force: Option<bool>) -> bool {
        self.token.internal_storage_unregister(force).is_some()
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        self.token.storage_balance_bounds()
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.token.storage_balance_of(account_id)
    }
}

#[near]
impl FungibleTokenMetadataProvider for MockFt {
    fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: FT_METADATA_SPEC.to_string(),
            name: "Mock USDC (testnet only)".to_string(),
            symbol: "mUSDC".to_string(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: 6,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    #[test]
    fn mint_registers_and_credits() {
        let mut c = MockFt::new();
        let min = c.storage_balance_bounds().min;
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(1)).attached_deposit(min).build());
        c.mint(accounts(2), U128(5_000_000));
        assert_eq!(c.ft_balance_of(accounts(2)).0, 5_000_000);
        assert_eq!(c.ft_total_supply().0, 5_000_000);
    }

    #[test]
    #[should_panic(expected = "attach storage deposit")]
    fn mint_new_account_needs_deposit() {
        let mut c = MockFt::new();
        testing_env!(VMContextBuilder::new().predecessor_account_id(accounts(1)).build());
        c.mint(accounts(2), U128(1));
    }

    #[test]
    #[should_panic(expected = "amount must be")]
    fn mint_capped() {
        let mut c = MockFt::new();
        c.mint(accounts(2), U128(MAX_MINT + 1));
    }
}
