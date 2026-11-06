//! Presafe: a business posts a USDC bond and reserves part of it for each obligation
//! (for example, an event). Customers pay through the contract; the payment is forwarded to
//! the business at once (this is not escrow) and recorded as a covered receipt. If the
//! business does not deliver, receipt holders claim their pro-rata share of the reserve.
//!
//! Token flows use NEP-141 `ft_transfer_call` with a JSON `msg`:
//! - `{"action":"fund_bond"}` or `{"action":"fund_bond","business":"<account>"}`
//! - `{"action":"pay","obligation_id":<n>}` or `{"action":"pay","obligation_id":<n>,"payer":"<account>"}`
//!
//! `payer` lets a third party deliver a payment on a customer's behalf (for example a NEAR
//! Intents 1Click withdrawal with `customRecipientMsg`). The contract cannot verify that the
//! named payer funded it; see the README's known limitations.

use near_contract_standards::fungible_token::receiver::FungibleTokenReceiver;
use near_contract_standards::storage_management::{
    StorageBalance, StorageBalanceBounds, StorageManagement,
};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{self, json};
use near_sdk::store::{IterableMap, LookupMap, Vector};
use near_sdk::{
    env, ext_contract, near, require, AccountId, BorshStorageKey, Gas, NearToken,
    PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

#[cfg(test)]
mod tests;

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(10);

/// Deliberately generous per-record byte estimates used to charge businesses for storage.
/// `near_sdk::store` collections flush at the end of a call, so live measurement is not used.
const BUSINESS_BYTES: u64 = 400;
const OBLIGATION_BYTES: u64 = 500;
const RECEIPT_BYTES: u64 = 300;

const MAX_TITLE_LEN: usize = 100;
const MAX_NAME_LEN: usize = 64;
const BPS: u128 = 10_000;

#[near]
#[derive(BorshStorageKey)]
enum Key {
    Businesses,
    Obligations,
    Receipts,
    PayerReceipts,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Status {
    Open,
    MarkedDelivered,
    Disputed,
    Delivered,
    Defaulted,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Config {
    pub owner: AccountId,
    /// The only token accepted (USDC on mainnet, a mock NEP-141 on testnet).
    pub usdc: AccountId,
    pub default_arbiter: AccountId,
    pub default_challenge_window_ns: U64,
    pub default_grace_ns: U64,
    /// Disputes from holders of at least this share of covered value move an obligation to `Disputed`.
    pub dispute_threshold_bps: u16,
    /// NEAR attached to the token's `storage_deposit` for a claimant before paying them.
    pub ft_storage_deposit: U128,
}

#[near(serializers = [borsh])]
pub struct Business {
    pub name: String,
    pub arbiter: AccountId,
    pub unlocked: u128,
    pub locked: u128,
    pub storage_deposit: u128,
    pub storage_bytes: u64,
    pub obligation_ids: Vec<u64>,
    pub total_covered: u128,
    pub claims_paid_count: u64,
    pub claims_paid_amount: u128,
}

#[near(serializers = [borsh])]
pub struct Obligation {
    pub business: AccountId,
    pub arbiter: AccountId,
    pub title: String,
    pub deliver_by_ns: u64,
    pub challenge_window_ns: u64,
    pub grace_ns: u64,
    pub dispute_threshold_bps: u16,
    pub status: Status,
    /// Bond reserved for this obligation. Reduced to `covered_total` on default (excess unlocks).
    pub reserve: u128,
    pub covered_total: u128,
    pub disputed_total: u128,
    pub claimed_total: u128,
    pub receipt_ids: Vec<u64>,
    pub marked_delivered_at_ns: Option<u64>,
    pub closed_at_ns: Option<u64>,
}

#[near(serializers = [borsh])]
pub struct Receipt {
    pub obligation_id: u64,
    pub payer: AccountId,
    pub amount: u128,
    pub paid_at_ns: u64,
    /// Set when forwarding the payment to the business failed; the payment was refunded.
    pub voided: bool,
    pub disputed: bool,
    pub claimed: bool,
    pub payout: u128,
}

#[near(serializers = [json])]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum TransferMsg {
    FundBond { business: Option<AccountId> },
    Pay { obligation_id: u64, payer: Option<AccountId> },
}

// ---------- JSON views ----------

#[near(serializers = [json])]
pub struct BusinessView {
    pub account_id: AccountId,
    pub name: String,
    pub arbiter: AccountId,
    pub bond_total: U128,
    pub unlocked: U128,
    pub locked: U128,
    pub obligation_count: u64,
    pub total_covered: U128,
    pub claims_paid_count: u64,
    pub claims_paid_amount: U128,
    pub storage_deposit: U128,
    pub storage_cost: U128,
}

#[near(serializers = [json])]
pub struct ObligationView {
    pub id: U64,
    pub business: AccountId,
    pub arbiter: AccountId,
    pub title: String,
    pub status: Status,
    pub deliver_by_ns: U64,
    pub challenge_window_ns: U64,
    pub grace_ns: U64,
    /// After this time, anyone can trigger default if the obligation is still `Open`.
    pub default_after_ns: U64,
    pub challenge_ends_at_ns: Option<U64>,
    pub dispute_threshold_bps: u16,
    pub reserve: U128,
    pub covered_total: U128,
    /// reserve / covered_total in basis points; `None` when nothing is covered yet.
    pub coverage_bps: Option<U128>,
    pub disputed_total: U128,
    pub claimed_total: U128,
    pub receipt_count: u64,
    pub marked_delivered_at_ns: Option<U64>,
    pub closed_at_ns: Option<U64>,
}

#[near(serializers = [json])]
pub struct CoverageView {
    pub reserve: U128,
    pub covered_total: U128,
    pub coverage_bps: Option<U128>,
}

#[near(serializers = [json])]
pub struct ReceiptView {
    pub id: U64,
    pub obligation_id: U64,
    pub payer: AccountId,
    pub amount: U128,
    pub paid_at_ns: U64,
    pub voided: bool,
    pub disputed: bool,
    pub claimed: bool,
    pub payout: U128,
    /// What `claim` would pay now (0 unless the obligation is `Defaulted` and unclaimed).
    pub claimable: U128,
}

#[ext_contract(ext_ft)]
#[allow(dead_code)]
trait FtContract {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>);
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Presafe {
    config: Config,
    businesses: IterableMap<AccountId, Business>,
    obligations: Vector<Obligation>,
    receipts: Vector<Receipt>,
    payer_receipts: LookupMap<AccountId, Vec<u64>>,
}

fn emit(event: &str, data: serde_json::Value) {
    env::log_str(&format!(
        "EVENT_JSON:{}",
        json!({ "standard": "presafe", "version": "1.0.0", "event": event, "data": [data] })
    ));
}

fn now() -> u64 {
    env::block_timestamp()
}

fn byte_cost(bytes: u64) -> u128 {
    bytes as u128 * env::storage_byte_cost().as_yoctonear()
}

fn coverage_bps(reserve: u128, covered: u128) -> Option<U128> {
    if covered == 0 {
        None
    } else {
        Some(U128(reserve * BPS / covered))
    }
}

#[near]
impl Presafe {
    #[init]
    pub fn new(
        owner: AccountId,
        usdc: AccountId,
        default_arbiter: AccountId,
        default_challenge_window_ns: Option<U64>,
        default_grace_ns: Option<U64>,
        dispute_threshold_bps: Option<u16>,
        ft_storage_deposit: Option<U128>,
    ) -> Self {
        let threshold = dispute_threshold_bps.unwrap_or(2_000);
        require!(threshold > 0 && threshold as u128 <= BPS, "threshold must be 1..=10000 bps");
        Self {
            config: Config {
                owner,
                usdc,
                default_arbiter,
                default_challenge_window_ns: default_challenge_window_ns
                    .unwrap_or(U64(72 * 3600 * 1_000_000_000)),
                default_grace_ns: default_grace_ns.unwrap_or(U64(24 * 3600 * 1_000_000_000)),
                dispute_threshold_bps: threshold,
                ft_storage_deposit: ft_storage_deposit
                    .unwrap_or(U128(NearToken::from_micronear(1_250).as_yoctonear())),
            },
            businesses: IterableMap::new(Key::Businesses),
            obligations: Vector::new(Key::Obligations),
            receipts: Vector::new(Key::Receipts),
            payer_receipts: LookupMap::new(Key::PayerReceipts),
        }
    }

    // ---------- business setup ----------

    /// Registers the caller as a business. Attach NEAR for storage (see `storage_balance_bounds`).
    #[payable]
    pub fn register_business(&mut self, name: String, arbiter: Option<AccountId>) -> BusinessView {
        let id = env::predecessor_account_id();
        require!(!self.businesses.contains_key(&id), "already registered");
        require!(!name.is_empty() && name.len() <= MAX_NAME_LEN, "name must be 1..=64 bytes");
        let deposit = env::attached_deposit().as_yoctonear();
        let bytes = BUSINESS_BYTES + name.len() as u64;
        require!(deposit >= byte_cost(bytes), "attach more NEAR for storage");
        let arbiter = arbiter.unwrap_or_else(|| self.config.default_arbiter.clone());
        self.businesses.insert(
            id.clone(),
            Business {
                name: name.clone(),
                arbiter: arbiter.clone(),
                unlocked: 0,
                locked: 0,
                storage_deposit: deposit,
                storage_bytes: bytes,
                obligation_ids: vec![],
                total_covered: 0,
                claims_paid_count: 0,
                claims_paid_amount: 0,
            },
        );
        emit("business_registered", json!({ "business": id, "name": name, "arbiter": arbiter }));
        self.get_business(id).unwrap()
    }

    /// Reserves `reserve` of the caller's unlocked bond for a new obligation.
    pub fn create_obligation(
        &mut self,
        title: String,
        deliver_by_ns: U64,
        reserve: U128,
        challenge_window_ns: Option<U64>,
        grace_ns: Option<U64>,
    ) -> U64 {
        let id = env::predecessor_account_id();
        require!(!title.is_empty() && title.len() <= MAX_TITLE_LEN, "title must be 1..=100 bytes");
        require!(deliver_by_ns.0 > now(), "deliver_by must be in the future");
        require!(reserve.0 > 0, "reserve must be positive");
        let ob_id = self.obligations.len() as u64;
        let arbiter = {
            let b = self.businesses.get_mut(&id).unwrap_or_else(|| env::panic_str("not a business"));
            require!(reserve.0 <= b.unlocked, "reserve exceeds unlocked bond");
            b.storage_bytes += OBLIGATION_BYTES + title.len() as u64;
            require!(b.storage_deposit >= byte_cost(b.storage_bytes), "business storage deposit too low");
            b.unlocked -= reserve.0;
            b.locked += reserve.0;
            b.obligation_ids.push(ob_id);
            b.arbiter.clone()
        };
        self.obligations.push(Obligation {
            business: id.clone(),
            arbiter,
            title: title.clone(),
            deliver_by_ns: deliver_by_ns.0,
            challenge_window_ns: challenge_window_ns.unwrap_or(self.config.default_challenge_window_ns).0,
            grace_ns: grace_ns.unwrap_or(self.config.default_grace_ns).0,
            dispute_threshold_bps: self.config.dispute_threshold_bps,
            status: Status::Open,
            reserve: reserve.0,
            covered_total: 0,
            disputed_total: 0,
            claimed_total: 0,
            receipt_ids: vec![],
            marked_delivered_at_ns: None,
            closed_at_ns: None,
        });
        emit(
            "obligation_created",
            json!({ "obligation_id": U64(ob_id), "business": id, "title": title, "reserve": reserve, "deliver_by_ns": deliver_by_ns }),
        );
        U64(ob_id)
    }

    /// Moves more unlocked bond into an open obligation's reserve.
    pub fn add_reserve(&mut self, obligation_id: U64, amount: U128) {
        let id = env::predecessor_account_id();
        let ob = self.ob_mut(obligation_id.0);
        require!(ob.business == id, "only the business");
        require!(ob.status == Status::Open, "obligation not open");
        ob.reserve += amount.0;
        let b = self.businesses.get_mut(&id).unwrap();
        require!(amount.0 > 0 && amount.0 <= b.unlocked, "amount exceeds unlocked bond");
        b.unlocked -= amount.0;
        b.locked += amount.0;
        emit("reserve_added", json!({ "obligation_id": obligation_id, "amount": amount }));
    }

    /// Withdraws unlocked bond to the caller. Requires 1 yoctoNEAR.
    #[payable]
    pub fn withdraw_bond(&mut self, amount: U128) -> Promise {
        near_sdk::assert_one_yocto();
        let id = env::predecessor_account_id();
        let b = self.businesses.get_mut(&id).unwrap_or_else(|| env::panic_str("not a business"));
        require!(amount.0 > 0 && amount.0 <= b.unlocked, "amount exceeds unlocked bond");
        b.unlocked -= amount.0;
        ext_ft::ext(self.config.usdc.clone())
            .with_attached_deposit(ONE_YOCTO)
            .with_static_gas(GAS_FT_TRANSFER)
            .ft_transfer(id.clone(), amount, Some("presafe bond withdrawal".into()))
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_withdraw(id, amount))
    }

    #[private]
    pub fn on_withdraw(&mut self, #[callback_result] r: Result<(), PromiseError>, business: AccountId, amount: U128) -> bool {
        self.internal_on_withdraw(r.is_ok(), business, amount)
    }

    // ---------- lifecycle ----------

    /// Business marks the obligation delivered, after `deliver_by` and before the grace period ends.
    pub fn mark_delivered(&mut self, obligation_id: U64) {
        let caller = env::predecessor_account_id();
        let t = now();
        let ob = self.ob_mut(obligation_id.0);
        require!(ob.business == caller, "only the business");
        require!(ob.status == Status::Open, "obligation not open");
        require!(t >= ob.deliver_by_ns, "too early: deliver_by not reached");
        require!(t < ob.deliver_by_ns + ob.grace_ns, "grace period over; obligation can be defaulted");
        ob.status = Status::MarkedDelivered;
        ob.marked_delivered_at_ns = Some(t);
        emit("marked_delivered", json!({ "obligation_id": obligation_id }));
    }

    /// A receipt holder disputes delivery during the challenge window.
    pub fn dispute(&mut self, receipt_id: U64) {
        let caller = env::predecessor_account_id();
        let t = now();
        let (ob_id, amount) = {
            let r = self.receipt_mut(receipt_id.0);
            require!(r.payer == caller, "only the receipt holder");
            require!(!r.voided, "receipt voided");
            require!(!r.disputed, "already disputed");
            r.disputed = true;
            (r.obligation_id, r.amount)
        };
        let ob = self.ob_mut(ob_id);
        require!(ob.status == Status::MarkedDelivered, "obligation is not awaiting confirmation");
        require!(t < ob.marked_delivered_at_ns.unwrap() + ob.challenge_window_ns, "challenge window closed");
        ob.disputed_total += amount;
        if ob.disputed_total * BPS >= ob.covered_total * ob.dispute_threshold_bps as u128 {
            ob.status = Status::Disputed;
        }
        let status = ob.status;
        emit("disputed", json!({ "obligation_id": U64(ob_id), "receipt_id": receipt_id, "status": status }));
    }

    /// Anyone: after a delivery mark's challenge window closes undisputed, unlock the reserve.
    pub fn release(&mut self, obligation_id: U64) {
        let t = now();
        let ob = self.ob_mut(obligation_id.0);
        require!(ob.status == Status::MarkedDelivered, "obligation is not awaiting confirmation");
        require!(t >= ob.marked_delivered_at_ns.unwrap() + ob.challenge_window_ns, "challenge window still open");
        self.internal_deliver(obligation_id.0);
    }

    /// Arbiter settles a disputed obligation.
    pub fn resolve(&mut self, obligation_id: U64, delivered: bool) {
        let caller = env::predecessor_account_id();
        let ob = self.ob_mut(obligation_id.0);
        require!(ob.arbiter == caller, "only the arbiter");
        require!(ob.status == Status::Disputed, "obligation not disputed");
        if delivered {
            self.internal_deliver(obligation_id.0);
        } else {
            self.internal_default(obligation_id.0);
        }
    }

    /// Anyone: default an obligation that is still `Open` after `deliver_by` + grace.
    pub fn trigger_default(&mut self, obligation_id: U64) {
        let ob = self.ob_mut(obligation_id.0);
        require!(ob.status == Status::Open, "obligation not open");
        require!(now() >= ob.deliver_by_ns + ob.grace_ns, "too early: deliver_by + grace not reached");
        self.internal_default(obligation_id.0);
    }

    /// The business (admitting non-delivery) or the arbiter can default an unsettled obligation at any time.
    pub fn declare_default(&mut self, obligation_id: U64) {
        let caller = env::predecessor_account_id();
        let ob = self.ob_mut(obligation_id.0);
        require!(caller == ob.business || caller == ob.arbiter, "only the business or the arbiter");
        require!(
            matches!(ob.status, Status::Open | Status::MarkedDelivered | Status::Disputed),
            "obligation already settled"
        );
        self.internal_default(obligation_id.0);
    }

    /// Receipt holder claims their share of a defaulted obligation's reserve.
    /// Registers the holder with the token contract (paid by this contract) and transfers.
    pub fn claim(&mut self, receipt_id: U64) -> Promise {
        let caller = env::predecessor_account_id();
        let payout = self.internal_start_claim(receipt_id.0, &caller);
        ext_ft::ext(self.config.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(self.config.ft_storage_deposit.0))
            .with_static_gas(GAS_STORAGE_DEPOSIT)
            .storage_deposit(Some(caller.clone()), Some(true))
            .then(
                ext_ft::ext(self.config.usdc.clone())
                    .with_attached_deposit(ONE_YOCTO)
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(caller, U128(payout), Some(format!("presafe claim {}", receipt_id.0))),
            )
            .then(Self::ext(env::current_account_id()).with_static_gas(GAS_CALLBACK).on_claim(receipt_id))
    }

    #[private]
    pub fn on_claim(&mut self, #[callback_result] r: Result<(), PromiseError>, receipt_id: U64) -> bool {
        self.internal_on_claim(r.is_ok(), receipt_id.0)
    }

    #[private]
    pub fn on_forward(&mut self, #[callback_result] r: Result<(), PromiseError>, receipt_id: U64) -> U128 {
        U128(self.internal_on_forward(r.is_ok(), receipt_id.0))
    }

    // ---------- owner ----------

    pub fn set_config(&mut self, default_arbiter: Option<AccountId>, ft_storage_deposit: Option<U128>) {
        require!(env::predecessor_account_id() == self.config.owner, "only the owner");
        if let Some(a) = default_arbiter {
            self.config.default_arbiter = a;
        }
        if let Some(d) = ft_storage_deposit {
            self.config.ft_storage_deposit = d;
        }
    }

    // ---------- views ----------

    pub fn get_config(&self) -> Config {
        self.config.clone()
    }

    pub fn get_business(&self, account_id: AccountId) -> Option<BusinessView> {
        self.businesses.get(&account_id).map(|b| BusinessView {
            account_id: account_id.clone(),
            name: b.name.clone(),
            arbiter: b.arbiter.clone(),
            bond_total: U128(b.unlocked + b.locked),
            unlocked: U128(b.unlocked),
            locked: U128(b.locked),
            obligation_count: b.obligation_ids.len() as u64,
            total_covered: U128(b.total_covered),
            claims_paid_count: b.claims_paid_count,
            claims_paid_amount: U128(b.claims_paid_amount),
            storage_deposit: U128(b.storage_deposit),
            storage_cost: U128(byte_cost(b.storage_bytes)),
        })
    }

    pub fn list_businesses(&self, from_index: Option<u32>, limit: Option<u32>) -> Vec<BusinessView> {
        self.businesses
            .keys()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .filter_map(|k| self.get_business(k.clone()))
            .collect()
    }

    pub fn get_obligation(&self, obligation_id: U64) -> Option<ObligationView> {
        self.obligations.get(obligation_id.0 as u32).map(|o| ObligationView {
            id: obligation_id,
            business: o.business.clone(),
            arbiter: o.arbiter.clone(),
            title: o.title.clone(),
            status: o.status,
            deliver_by_ns: U64(o.deliver_by_ns),
            challenge_window_ns: U64(o.challenge_window_ns),
            grace_ns: U64(o.grace_ns),
            default_after_ns: U64(o.deliver_by_ns + o.grace_ns),
            challenge_ends_at_ns: o.marked_delivered_at_ns.map(|m| U64(m + o.challenge_window_ns)),
            dispute_threshold_bps: o.dispute_threshold_bps,
            reserve: U128(o.reserve),
            covered_total: U128(o.covered_total),
            coverage_bps: coverage_bps(o.reserve, o.covered_total),
            disputed_total: U128(o.disputed_total),
            claimed_total: U128(o.claimed_total),
            receipt_count: o.receipt_ids.len() as u64,
            marked_delivered_at_ns: o.marked_delivered_at_ns.map(U64),
            closed_at_ns: o.closed_at_ns.map(U64),
        })
    }

    pub fn list_obligations(&self, business: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<ObligationView> {
        match self.businesses.get(&business) {
            None => vec![],
            Some(b) => b
                .obligation_ids
                .iter()
                .skip(from_index.unwrap_or(0) as usize)
                .take(limit.unwrap_or(50).min(100) as usize)
                .filter_map(|id| self.get_obligation(U64(*id)))
                .collect(),
        }
    }

    pub fn get_coverage(&self, obligation_id: U64) -> Option<CoverageView> {
        self.obligations.get(obligation_id.0 as u32).map(|o| CoverageView {
            reserve: U128(o.reserve),
            covered_total: U128(o.covered_total),
            coverage_bps: coverage_bps(o.reserve, o.covered_total),
        })
    }

    pub fn get_receipt(&self, receipt_id: U64) -> Option<ReceiptView> {
        self.receipts.get(receipt_id.0 as u32).map(|r| ReceiptView {
            id: receipt_id,
            obligation_id: U64(r.obligation_id),
            payer: r.payer.clone(),
            amount: U128(r.amount),
            paid_at_ns: U64(r.paid_at_ns),
            voided: r.voided,
            disputed: r.disputed,
            claimed: r.claimed,
            payout: U128(r.payout),
            claimable: U128(self.claimable(r)),
        })
    }

    pub fn list_receipts_by_obligation(&self, obligation_id: U64, from_index: Option<u32>, limit: Option<u32>) -> Vec<ReceiptView> {
        match self.obligations.get(obligation_id.0 as u32) {
            None => vec![],
            Some(o) => self.receipt_views(&o.receipt_ids, from_index, limit),
        }
    }

    pub fn list_receipts_by_payer(&self, payer: AccountId, from_index: Option<u32>, limit: Option<u32>) -> Vec<ReceiptView> {
        match self.payer_receipts.get(&payer) {
            None => vec![],
            Some(ids) => self.receipt_views(ids, from_index, limit),
        }
    }
}

// ---------- NEP-141 receiver ----------

#[near]
impl FungibleTokenReceiver for Presafe {
    fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        if env::predecessor_account_id() != self.config.usdc {
            env::log_str("presafe: token not accepted, returning it");
            return PromiseOrValue::Value(amount);
        }
        match serde_json::from_str::<TransferMsg>(&msg) {
            Err(_) => {
                env::log_str("presafe: invalid msg, returning tokens");
                PromiseOrValue::Value(amount)
            }
            Ok(TransferMsg::FundBond { business }) => {
                let id = business.unwrap_or(sender_id.clone());
                match self.businesses.get_mut(&id) {
                    None => {
                        env::log_str("presafe: not a registered business, returning tokens");
                        PromiseOrValue::Value(amount)
                    }
                    Some(b) => {
                        b.unlocked += amount.0;
                        emit("bond_funded", json!({ "business": id, "amount": amount, "sender": sender_id }));
                        PromiseOrValue::Value(U128(0))
                    }
                }
            }
            Ok(TransferMsg::Pay { obligation_id, payer }) => {
                let payer = payer.unwrap_or(sender_id.clone());
                match self.internal_record_payment(obligation_id, payer, amount.0, &sender_id) {
                    Err(reason) => {
                        env::log_str(&format!("presafe: payment rejected ({reason}), returning tokens"));
                        PromiseOrValue::Value(amount)
                    }
                    Ok((receipt_id, business)) => PromiseOrValue::Promise(
                        ext_ft::ext(self.config.usdc.clone())
                            .with_attached_deposit(ONE_YOCTO)
                            .with_static_gas(GAS_FT_TRANSFER)
                            .ft_transfer(business, amount, Some(format!("presafe receipt {receipt_id}")))
                            .then(
                                Self::ext(env::current_account_id())
                                    .with_static_gas(GAS_CALLBACK)
                                    .on_forward(U64(receipt_id)),
                            ),
                    ),
                }
            }
        }
    }
}

// ---------- NEP-145 storage (businesses only) ----------

#[near]
impl StorageManagement for Presafe {
    /// Tops up a registered business's storage balance. Use `register_business` to register.
    #[payable]
    fn storage_deposit(&mut self, account_id: Option<AccountId>, registration_only: Option<bool>) -> StorageBalance {
        let id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit().as_yoctonear();
        let b = self
            .businesses
            .get_mut(&id)
            .unwrap_or_else(|| env::panic_str("not a business: call register_business first"));
        if registration_only.unwrap_or(false) {
            if deposit > 0 {
                Promise::new(env::predecessor_account_id()).transfer(NearToken::from_yoctonear(deposit)).detach();
            }
        } else {
            b.storage_deposit += deposit;
        }
        self.storage_balance_of(id).unwrap()
    }

    #[payable]
    fn storage_withdraw(&mut self, amount: Option<NearToken>) -> StorageBalance {
        near_sdk::assert_one_yocto();
        let id = env::predecessor_account_id();
        let b = self.businesses.get_mut(&id).unwrap_or_else(|| env::panic_str("not a business"));
        let available = b.storage_deposit - byte_cost(b.storage_bytes);
        let amount = amount.map(|a| a.as_yoctonear()).unwrap_or(available);
        require!(amount <= available, "amount exceeds available storage balance");
        b.storage_deposit -= amount;
        if amount > 0 {
            Promise::new(id.clone()).transfer(NearToken::from_yoctonear(amount)).detach();
        }
        self.storage_balance_of(id).unwrap()
    }

    #[payable]
    fn storage_unregister(&mut self, _force: Option<bool>) -> bool {
        env::panic_str("unregistering businesses is not supported")
    }

    fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        StorageBalanceBounds {
            min: NearToken::from_yoctonear(byte_cost(BUSINESS_BYTES + MAX_NAME_LEN as u64)),
            max: None,
        }
    }

    fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        self.businesses.get(&account_id).map(|b| StorageBalance {
            total: NearToken::from_yoctonear(b.storage_deposit),
            available: NearToken::from_yoctonear(b.storage_deposit - byte_cost(b.storage_bytes)),
        })
    }
}

// ---------- internals (plain functions so unit tests can drive callbacks) ----------

impl Presafe {
    fn ob_mut(&mut self, id: u64) -> &mut Obligation {
        let idx = u32::try_from(id).unwrap_or_else(|_| env::panic_str("no such obligation"));
        self.obligations.get_mut(idx).unwrap_or_else(|| env::panic_str("no such obligation"))
    }

    fn receipt_mut(&mut self, id: u64) -> &mut Receipt {
        let idx = u32::try_from(id).unwrap_or_else(|_| env::panic_str("no such receipt"));
        self.receipts.get_mut(idx).unwrap_or_else(|| env::panic_str("no such receipt"))
    }

    fn claimable(&self, r: &Receipt) -> u128 {
        if r.voided || r.claimed {
            return 0;
        }
        match self.obligations.get(r.obligation_id as u32) {
            Some(o) if o.status == Status::Defaulted && o.covered_total > 0 => {
                r.amount.min(o.reserve * r.amount / o.covered_total)
            }
            _ => 0,
        }
    }

    fn receipt_views(&self, ids: &[u64], from_index: Option<u32>, limit: Option<u32>) -> Vec<ReceiptView> {
        ids.iter()
            .skip(from_index.unwrap_or(0) as usize)
            .take(limit.unwrap_or(50).min(100) as usize)
            .filter_map(|id| self.get_receipt(U64(*id)))
            .collect()
    }

    /// Validates a payment and records the receipt. Returns (receipt_id, business) or a reason to refund.
    pub(crate) fn internal_record_payment(
        &mut self,
        obligation_id: u64,
        payer: AccountId,
        amount: u128,
        sender: &AccountId,
    ) -> Result<(u64, AccountId), &'static str> {
        if amount == 0 {
            return Err("zero amount");
        }
        let receipt_id = self.receipts.len() as u64;
        let t = now();
        let idx = u32::try_from(obligation_id).map_err(|_| "no such obligation")?;
        let business = {
            let ob = self.obligations.get(idx).ok_or("no such obligation")?;
            if ob.status != Status::Open {
                return Err("obligation not open");
            }
            if t >= ob.deliver_by_ns {
                return Err("deliver_by has passed");
            }
            ob.business.clone()
        };
        {
            let b = self.businesses.get_mut(&business).ok_or("business missing")?;
            let bytes = b.storage_bytes + RECEIPT_BYTES + payer.len() as u64;
            if b.storage_deposit < byte_cost(bytes) {
                return Err("business storage deposit too low");
            }
            b.storage_bytes = bytes;
            b.total_covered += amount;
        }
        let ob = self.obligations.get_mut(idx).unwrap();
        ob.covered_total += amount;
        ob.receipt_ids.push(receipt_id);
        self.receipts.push(Receipt {
            obligation_id,
            payer: payer.clone(),
            amount,
            paid_at_ns: t,
            voided: false,
            disputed: false,
            claimed: false,
            payout: 0,
        });
        let mut list = self.payer_receipts.get(&payer).cloned().unwrap_or_default();
        list.push(receipt_id);
        self.payer_receipts.insert(payer.clone(), list);
        emit(
            "paid",
            json!({ "receipt_id": U64(receipt_id), "obligation_id": U64(obligation_id), "payer": payer, "sender": sender, "amount": U128(amount) }),
        );
        Ok((receipt_id, business))
    }

    /// Returns the unused token amount for `ft_on_transfer`: 0 on success, the full amount if forwarding failed.
    pub(crate) fn internal_on_forward(&mut self, ok: bool, receipt_id: u64) -> u128 {
        if ok {
            return 0;
        }
        let (ob_id, amount) = {
            let r = self.receipt_mut(receipt_id);
            r.voided = true;
            (r.obligation_id, r.amount)
        };
        let business = {
            let ob = self.ob_mut(ob_id);
            ob.covered_total -= amount;
            ob.business.clone()
        };
        if let Some(b) = self.businesses.get_mut(&business) {
            b.total_covered -= amount;
        }
        emit("payment_voided", json!({ "receipt_id": U64(receipt_id) }));
        amount
    }

    fn internal_deliver(&mut self, obligation_id: u64) {
        let t = now();
        let (business, reserve) = {
            let ob = self.ob_mut(obligation_id);
            ob.status = Status::Delivered;
            ob.closed_at_ns = Some(t);
            (ob.business.clone(), ob.reserve)
        };
        let b = self.businesses.get_mut(&business).unwrap();
        b.locked -= reserve;
        b.unlocked += reserve;
        emit("delivered", json!({ "obligation_id": U64(obligation_id), "released": U128(reserve) }));
    }

    fn internal_default(&mut self, obligation_id: u64) {
        let t = now();
        let (business, excess) = {
            let ob = self.ob_mut(obligation_id);
            ob.status = Status::Defaulted;
            ob.closed_at_ns = Some(t);
            let excess = ob.reserve.saturating_sub(ob.covered_total);
            ob.reserve -= excess;
            (ob.business.clone(), excess)
        };
        let b = self.businesses.get_mut(&business).unwrap();
        b.locked -= excess;
        b.unlocked += excess;
        emit("defaulted", json!({ "obligation_id": U64(obligation_id), "excess_unlocked": U128(excess) }));
    }

    /// Validates a claim and marks it paid optimistically. Returns the payout.
    pub(crate) fn internal_start_claim(&mut self, receipt_id: u64, caller: &AccountId) -> u128 {
        let (ob_id, amount, payer) = {
            let r = self.receipt_mut(receipt_id);
            (r.obligation_id, r.amount, r.payer.clone())
        };
        require!(&payer == caller, "only the receipt holder");
        let payout = {
            let r = self.receipts.get(receipt_id as u32).unwrap();
            require!(!r.voided, "receipt voided");
            require!(!r.claimed, "already claimed");
            let ob = self.obligations.get(ob_id as u32).unwrap();
            require!(ob.status == Status::Defaulted, "obligation not defaulted");
            self.claimable(r)
        };
        require!(payout > 0, "nothing to claim");
        let business = {
            let ob = self.ob_mut(ob_id);
            ob.claimed_total += payout;
            ob.business.clone()
        };
        {
            let r = self.receipt_mut(receipt_id);
            r.claimed = true;
            r.payout = payout;
        }
        let b = self.businesses.get_mut(&business).unwrap();
        b.locked -= payout;
        b.claims_paid_count += 1;
        b.claims_paid_amount += payout;
        emit("claim_started", json!({ "receipt_id": U64(receipt_id), "payer": payer, "payout": U128(payout), "amount": U128(amount) }));
        payout
    }

    pub(crate) fn internal_on_claim(&mut self, ok: bool, receipt_id: u64) -> bool {
        if ok {
            emit("claim_paid", json!({ "receipt_id": U64(receipt_id) }));
            return true;
        }
        let (ob_id, payout) = {
            let r = self.receipt_mut(receipt_id);
            let p = r.payout;
            r.claimed = false;
            r.payout = 0;
            (r.obligation_id, p)
        };
        let business = {
            let ob = self.ob_mut(ob_id);
            ob.claimed_total -= payout;
            ob.business.clone()
        };
        let b = self.businesses.get_mut(&business).unwrap();
        b.locked += payout;
        b.claims_paid_count -= 1;
        b.claims_paid_amount -= payout;
        emit("claim_failed", json!({ "receipt_id": U64(receipt_id) }));
        false
    }

    pub(crate) fn internal_on_withdraw(&mut self, ok: bool, business: AccountId, amount: U128) -> bool {
        if ok {
            emit("bond_withdrawn", json!({ "business": business, "amount": amount }));
            return true;
        }
        if let Some(b) = self.businesses.get_mut(&business) {
            b.unlocked += amount.0;
        }
        false
    }
}
