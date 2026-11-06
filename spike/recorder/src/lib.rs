//! Spike contract. Answers one question: when 1Click withdraws to NEAR with
//! `customRecipientMsg`, what does `ft_on_transfer` receive?
//!
//! It records every call (sender_id, predecessor, signer, amount, msg) and keeps
//! tokens from the configured token contract. Any other token is returned as
//! unused so the token contract refunds it. The owner can withdraw.

use near_sdk::json_types::U128;
use near_sdk::store::Vector;
use near_sdk::{env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseOrValue};

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Record {
    pub sender_id: AccountId,
    pub predecessor_id: AccountId,
    pub signer_id: AccountId,
    pub amount: U128,
    pub msg: String,
    pub accepted: bool,
    pub block_height: u64,
    pub block_timestamp_ns: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Recorder {
    owner: AccountId,
    token: AccountId,
    records: Vector<Record>,
}

const MAX_MSG_LEN: usize = 1024;

#[near]
impl Recorder {
    #[init]
    pub fn new(owner: AccountId, token: AccountId) -> Self {
        Self { owner, token, records: Vector::new(b"r") }
    }

    /// NEP-141 receiver. Returns the unused amount.
    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        let predecessor_id = env::predecessor_account_id();
        let accepted = predecessor_id == self.token;
        let mut msg = msg;
        msg.truncate(MAX_MSG_LEN);
        let record = Record {
            sender_id,
            predecessor_id,
            signer_id: env::signer_account_id(),
            amount,
            msg,
            accepted,
            block_height: env::block_height(),
            block_timestamp_ns: env::block_timestamp(),
        };
        env::log_str(&format!("spike_record: {}", near_sdk::serde_json::to_string(&record).unwrap()));
        self.records.push(record);
        PromiseOrValue::Value(if accepted { U128(0) } else { amount })
    }

    pub fn get_records(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<Record> {
        let from = from_index.unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100);
        self.records.iter().skip(from as usize).take(limit as usize).cloned().collect()
    }

    pub fn get_config(&self) -> (AccountId, AccountId) {
        (self.owner.clone(), self.token.clone())
    }

    /// Owner only: send tokens out (attaches the 1 yoctoNEAR that ft_transfer requires).
    pub fn withdraw(&mut self, token: AccountId, receiver_id: AccountId, amount: U128) -> Promise {
        require!(env::predecessor_account_id() == self.owner, "owner only");
        Promise::new(token)
            .function_call(
                "ft_transfer".to_string(),
                near_sdk::serde_json::json!({ "receiver_id": receiver_id, "amount": amount })
                    .to_string()
                    .into_bytes(),
                NearToken::from_yoctonear(1),
                Gas::from_tgas(15),
            )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId) {
        testing_env!(VMContextBuilder::new().predecessor_account_id(predecessor).build());
    }

    #[test]
    fn keeps_configured_token_and_records() {
        ctx(accounts(1));
        let mut c = Recorder::new(accounts(0), accounts(1));
        let out = c.ft_on_transfer(accounts(2), U128(1_000_000), "{\"obligation_id\":7}".into());
        assert!(matches!(out, PromiseOrValue::Value(U128(0))));
        let r = c.get_records(None, None);
        assert_eq!(r.len(), 1);
        assert_eq!(r[0].sender_id, accounts(2));
        assert_eq!(r[0].predecessor_id, accounts(1));
        assert!(r[0].accepted);
    }

    #[test]
    fn returns_other_tokens() {
        ctx(accounts(3));
        let mut c = Recorder::new(accounts(0), accounts(1));
        let out = c.ft_on_transfer(accounts(2), U128(5), String::new());
        assert!(matches!(out, PromiseOrValue::Value(U128(5))));
        assert!(!c.get_records(None, None)[0].accepted);
    }

    #[test]
    #[should_panic(expected = "owner only")]
    fn withdraw_owner_only() {
        ctx(accounts(2));
        let mut c = Recorder::new(accounts(0), accounts(1));
        c.withdraw(accounts(1), accounts(2), U128(1));
    }
}
