use super::*;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::testing_env;

const SEC: u64 = 1_000_000_000;
const USDC_UNIT: u128 = 1_000_000;

fn acc(s: &str) -> AccountId {
    s.parse().unwrap()
}
fn usdc() -> AccountId {
    acc("musdc.testnet")
}
fn biz() -> AccountId {
    acc("lagos-sound-fest.testnet")
}
fn alice() -> AccountId {
    acc("alice.testnet")
}
fn bob() -> AccountId {
    acc("bob.testnet")
}
fn arbiter() -> AccountId {
    acc("arbiter.testnet")
}

/// Sets block time (seconds), caller, and attached deposit.
fn ctx(t: u64, caller: AccountId, deposit: u128) {
    testing_env!(VMContextBuilder::new()
        .current_account_id(acc("presafe.testnet"))
        .block_timestamp(t * SEC)
        .predecessor_account_id(caller)
        .attached_deposit(NearToken::from_yoctonear(deposit))
        .build());
}

fn value(p: PromiseOrValue<U128>) -> Option<u128> {
    match p {
        PromiseOrValue::Value(v) => Some(v.0),
        PromiseOrValue::Promise(_) => None,
    }
}

/// Contract with a registered business holding `bond` unlocked, and one obligation:
/// deliver_by t=1000s, grace 100s, challenge window 50s, reserve `reserve`.
fn setup(bond: u128, reserve: u128) -> Presafe {
    ctx(0, acc("owner.testnet"), 0);
    let mut c = Presafe::new(acc("owner.testnet"), usdc(), arbiter(), None, None, None, None);
    ctx(1, biz(), NearToken::from_near(1).as_yoctonear());
    c.register_business("Lagos Sound Fest".into(), None);
    fund(&mut c, bond);
    ctx(2, biz(), 0);
    let id = c.create_obligation("Lagos Sound Fest 2026".into(), U64(1000 * SEC), U128(reserve), Some(U64(50 * SEC)), Some(U64(100 * SEC)));
    assert_eq!(id.0, 0);
    c
}

fn fund(c: &mut Presafe, amount: u128) {
    ctx(1, usdc(), 0);
    let out = c.ft_on_transfer(biz(), U128(amount), r#"{"action":"fund_bond"}"#.into());
    assert_eq!(value(out), Some(0));
}

/// Pays at time `t` and simulates a successful forward. Returns receipt id.
fn pay(c: &mut Presafe, t: u64, sender: AccountId, amount: u128, msg: &str) -> u64 {
    ctx(t, usdc(), 0);
    let out = c.ft_on_transfer(sender, U128(amount), msg.into());
    assert!(value(out).is_none(), "expected a forwarding promise");
    let rid = c.receipts.len() as u64 - 1;
    assert_eq!(c.internal_on_forward(true, rid), 0);
    rid
}

fn pay_msg(ob: u64) -> String {
    format!(r#"{{"action":"pay","obligation_id":{ob}}}"#)
}

#[test]
fn fund_bond_credits_unlocked() {
    let c = setup(5 * USDC_UNIT, 2 * USDC_UNIT);
    let b = c.get_business(biz()).unwrap();
    assert_eq!(b.bond_total.0, 5 * USDC_UNIT);
    assert_eq!(b.unlocked.0, 3 * USDC_UNIT);
    assert_eq!(b.locked.0, 2 * USDC_UNIT);
}

#[test]
fn fund_bond_for_named_business() {
    let mut c = setup(1, 1);
    ctx(3, usdc(), 0);
    let msg = format!(r#"{{"action":"fund_bond","business":"{}"}}"#, biz());
    assert_eq!(value(c.ft_on_transfer(alice(), U128(7), msg)), Some(0));
    assert_eq!(c.get_business(biz()).unwrap().unlocked.0, 7);
}

#[test]
fn fund_bond_unregistered_is_returned() {
    let mut c = setup(1, 1);
    ctx(3, usdc(), 0);
    assert_eq!(value(c.ft_on_transfer(alice(), U128(9), r#"{"action":"fund_bond"}"#.into())), Some(9));
}

#[test]
fn wrong_token_is_returned() {
    let mut c = setup(1, 1);
    ctx(3, acc("fake-usdc.testnet"), 0);
    assert_eq!(value(c.ft_on_transfer(biz(), U128(1_000), r#"{"action":"fund_bond"}"#.into())), Some(1_000));
    assert_eq!(c.get_business(biz()).unwrap().bond_total.0, 1);
}

#[test]
fn invalid_msg_is_returned() {
    let mut c = setup(1, 1);
    ctx(3, usdc(), 0);
    assert_eq!(value(c.ft_on_transfer(alice(), U128(5), "hello".into())), Some(5));
}

#[test]
fn pay_records_receipt_and_coverage() {
    let mut c = setup(5 * USDC_UNIT, 4 * USDC_UNIT);
    let rid = pay(&mut c, 10, alice(), 2 * USDC_UNIT, &pay_msg(0));
    let r = c.get_receipt(U64(rid)).unwrap();
    assert_eq!(r.payer, alice());
    assert_eq!(r.amount.0, 2 * USDC_UNIT);
    let cov = c.get_coverage(U64(0)).unwrap();
    assert_eq!(cov.covered_total.0, 2 * USDC_UNIT);
    assert_eq!(cov.coverage_bps, Some(U128(20_000)));
    assert_eq!(c.list_receipts_by_payer(alice(), None, None).len(), 1);
    assert_eq!(c.get_business(biz()).unwrap().total_covered.0, 2 * USDC_UNIT);
}

#[test]
fn pay_with_named_payer_credits_payer_not_sender() {
    // A 1Click delivery: the sender is the bridge/intents side, the msg names the customer.
    let mut c = setup(5 * USDC_UNIT, 2 * USDC_UNIT);
    let msg = format!(r#"{{"action":"pay","obligation_id":0,"payer":"{}"}}"#, alice());
    let rid = pay(&mut c, 10, acc("intents.near"), USDC_UNIT, &msg);
    assert_eq!(c.get_receipt(U64(rid)).unwrap().payer, alice());
    assert!(c.list_receipts_by_payer(acc("intents.near"), None, None).is_empty());
}

#[test]
fn pay_below_full_coverage_still_accepted() {
    let mut c = setup(1 * USDC_UNIT, 1 * USDC_UNIT);
    pay(&mut c, 10, alice(), 4 * USDC_UNIT, &pay_msg(0));
    assert_eq!(c.get_coverage(U64(0)).unwrap().coverage_bps, Some(U128(2_500)));
}

#[test]
fn pay_after_deadline_or_unknown_obligation_is_returned() {
    let mut c = setup(5, 5);
    ctx(1000, usdc(), 0);
    assert_eq!(value(c.ft_on_transfer(alice(), U128(3), pay_msg(0))), Some(3));
    assert_eq!(value(c.ft_on_transfer(alice(), U128(3), pay_msg(9))), Some(3));
}

#[test]
fn failed_forward_voids_receipt_and_refunds() {
    let mut c = setup(5, 5);
    ctx(10, usdc(), 0);
    assert!(value(c.ft_on_transfer(alice(), U128(3), pay_msg(0))).is_none());
    assert_eq!(c.internal_on_forward(false, 0), 3);
    assert!(c.get_receipt(U64(0)).unwrap().voided);
    assert_eq!(c.get_coverage(U64(0)).unwrap().covered_total.0, 0);
}

#[test]
fn mark_delivered_then_release_unlocks_reserve() {
    let mut c = setup(5 * USDC_UNIT, 2 * USDC_UNIT);
    pay(&mut c, 10, alice(), USDC_UNIT, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::MarkedDelivered);
    ctx(1050, acc("anyone.testnet"), 0);
    c.release(U64(0));
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::Delivered);
    let b = c.get_business(biz()).unwrap();
    assert_eq!(b.locked.0, 0);
    assert_eq!(b.unlocked.0, 5 * USDC_UNIT);
}

#[test]
#[should_panic(expected = "too early")]
fn mark_delivered_before_deadline_fails() {
    let mut c = setup(5, 5);
    ctx(999, biz(), 0);
    c.mark_delivered(U64(0));
}

#[test]
#[should_panic(expected = "challenge window still open")]
fn release_during_challenge_window_fails() {
    let mut c = setup(5, 5);
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1049, biz(), 0);
    c.release(U64(0));
}

#[test]
fn dispute_below_threshold_keeps_status() {
    let mut c = setup(10, 10);
    let small = pay(&mut c, 10, alice(), 1, &pay_msg(0));
    pay(&mut c, 11, bob(), 9, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1010, alice(), 0);
    c.dispute(U64(small)); // 10% < 20%
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::MarkedDelivered);
}

#[test]
fn dispute_over_threshold_then_arbiter_defaults_and_claim() {
    let mut c = setup(10, 10);
    let r = pay(&mut c, 10, alice(), 5, &pay_msg(0));
    pay(&mut c, 11, bob(), 5, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1010, alice(), 0);
    c.dispute(U64(r)); // 50% >= 20%
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::Disputed);
    ctx(1020, arbiter(), 0);
    c.resolve(U64(0), false);
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::Defaulted);
    ctx(1030, alice(), 0);
    assert_eq!(c.internal_start_claim(r, &alice()), 5);
}

#[test]
fn arbiter_can_resolve_delivered() {
    let mut c = setup(10, 10);
    let r = pay(&mut c, 10, alice(), 5, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1010, alice(), 0);
    c.dispute(U64(r));
    ctx(1020, arbiter(), 0);
    c.resolve(U64(0), true);
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::Delivered);
    assert_eq!(c.get_business(biz()).unwrap().unlocked.0, 10);
}

#[test]
#[should_panic(expected = "only the arbiter")]
fn only_arbiter_resolves() {
    let mut c = setup(10, 10);
    let r = pay(&mut c, 10, alice(), 5, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1010, alice(), 0);
    c.dispute(U64(r));
    ctx(1020, biz(), 0);
    c.resolve(U64(0), true);
}

#[test]
#[should_panic(expected = "only the receipt holder")]
fn only_holder_disputes() {
    let mut c = setup(10, 10);
    let r = pay(&mut c, 10, alice(), 5, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1010, bob(), 0);
    c.dispute(U64(r));
}

#[test]
#[should_panic(expected = "challenge window closed")]
fn dispute_after_window_fails() {
    let mut c = setup(10, 10);
    let r = pay(&mut c, 10, alice(), 5, &pay_msg(0));
    ctx(1000, biz(), 0);
    c.mark_delivered(U64(0));
    ctx(1050, alice(), 0);
    c.dispute(U64(r));
}

#[test]
fn trigger_default_after_grace_and_excess_unlocks() {
    let mut c = setup(10 * USDC_UNIT, 5 * USDC_UNIT);
    pay(&mut c, 10, alice(), 2 * USDC_UNIT, &pay_msg(0));
    ctx(1100, acc("anyone.testnet"), 0);
    c.trigger_default(U64(0));
    let ob = c.get_obligation(U64(0)).unwrap();
    assert_eq!(ob.status, Status::Defaulted);
    assert_eq!(ob.reserve.0, 2 * USDC_UNIT); // 3 USDC of excess reserve unlocked
    let b = c.get_business(biz()).unwrap();
    assert_eq!(b.unlocked.0, 8 * USDC_UNIT);
    assert_eq!(b.locked.0, 2 * USDC_UNIT);
}

#[test]
#[should_panic(expected = "too early")]
fn trigger_default_before_grace_fails() {
    let mut c = setup(5, 5);
    ctx(1099, acc("anyone.testnet"), 0);
    c.trigger_default(U64(0));
}

#[test]
#[should_panic(expected = "grace period over")]
fn mark_delivered_after_grace_fails() {
    let mut c = setup(5, 5);
    ctx(1100, biz(), 0);
    c.mark_delivered(U64(0));
}

#[test]
fn business_can_declare_default() {
    let mut c = setup(5, 5);
    ctx(20, biz(), 0);
    c.declare_default(U64(0));
    assert_eq!(c.get_obligation(U64(0)).unwrap().status, Status::Defaulted);
}

#[test]
fn claim_pays_pro_rata_when_under_covered() {
    let mut c = setup(3 * USDC_UNIT, 3 * USDC_UNIT);
    let a = pay(&mut c, 10, alice(), 2 * USDC_UNIT, &pay_msg(0));
    let b = pay(&mut c, 11, bob(), 4 * USDC_UNIT, &pay_msg(0));
    ctx(1100, acc("anyone.testnet"), 0);
    c.trigger_default(U64(0));
    // reserve 3, covered 6: each gets half.
    assert_eq!(c.get_receipt(U64(a)).unwrap().claimable.0, USDC_UNIT);
    ctx(1101, alice(), 0);
    assert_eq!(c.internal_start_claim(a, &alice()), USDC_UNIT);
    assert!(c.internal_on_claim(true, a));
    ctx(1102, bob(), 0);
    assert_eq!(c.internal_start_claim(b, &bob()), 2 * USDC_UNIT);
    assert!(c.internal_on_claim(true, b));
    let bz = c.get_business(biz()).unwrap();
    assert_eq!(bz.claims_paid_count, 2);
    assert_eq!(bz.claims_paid_amount.0, 3 * USDC_UNIT);
    assert_eq!(bz.locked.0, 0);
}

#[test]
#[should_panic(expected = "already claimed")]
fn double_claim_fails() {
    let mut c = setup(5, 5);
    let r = pay(&mut c, 10, alice(), 2, &pay_msg(0));
    ctx(1100, alice(), 0);
    c.trigger_default(U64(0));
    c.internal_start_claim(r, &alice());
    c.internal_on_claim(true, r);
    c.internal_start_claim(r, &alice());
}

#[test]
fn failed_claim_transfer_reverts_and_can_retry() {
    let mut c = setup(5, 5);
    let r = pay(&mut c, 10, alice(), 2, &pay_msg(0));
    ctx(1100, alice(), 0);
    c.trigger_default(U64(0));
    assert_eq!(c.internal_start_claim(r, &alice()), 2);
    assert!(!c.internal_on_claim(false, r));
    let rv = c.get_receipt(U64(r)).unwrap();
    assert!(!rv.claimed);
    assert_eq!(rv.claimable.0, 2);
    assert_eq!(c.get_business(biz()).unwrap().claims_paid_count, 0);
    assert_eq!(c.internal_start_claim(r, &alice()), 2);
}

#[test]
#[should_panic(expected = "obligation not defaulted")]
fn claim_before_default_fails() {
    let mut c = setup(5, 5);
    let r = pay(&mut c, 10, alice(), 2, &pay_msg(0));
    ctx(20, alice(), 0);
    c.internal_start_claim(r, &alice());
}

#[test]
#[should_panic(expected = "only the receipt holder")]
fn claim_by_other_fails() {
    let mut c = setup(5, 5);
    let r = pay(&mut c, 10, alice(), 2, &pay_msg(0));
    ctx(1100, bob(), 0);
    c.trigger_default(U64(0));
    c.internal_start_claim(r, &bob());
}

#[test]
#[should_panic(expected = "amount exceeds unlocked bond")]
fn withdraw_locked_funds_fails() {
    let mut c = setup(5, 4);
    ctx(20, biz(), 1);
    let _ = c.withdraw_bond(U128(2)); // only 1 unlocked
}

#[test]
fn withdraw_unlocked_and_failure_restores() {
    let mut c = setup(5, 4);
    ctx(20, biz(), 1);
    let _ = c.withdraw_bond(U128(1));
    assert_eq!(c.get_business(biz()).unwrap().unlocked.0, 0);
    assert!(!c.internal_on_withdraw(false, biz(), U128(1)));
    assert_eq!(c.get_business(biz()).unwrap().unlocked.0, 1);
}

#[test]
#[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
fn withdraw_requires_one_yocto() {
    let mut c = setup(5, 4);
    ctx(20, biz(), 0);
    let _ = c.withdraw_bond(U128(1));
}

#[test]
#[should_panic(expected = "reserve exceeds unlocked bond")]
fn create_obligation_over_unlocked_fails() {
    let mut c = setup(5, 4);
    ctx(20, biz(), 0);
    c.create_obligation("Second".into(), U64(2000 * SEC), U128(2), None, None);
}

#[test]
fn payment_refused_when_business_storage_runs_out() {
    ctx(0, acc("owner.testnet"), 0);
    let mut c = Presafe::new(acc("owner.testnet"), usdc(), arbiter(), None, None, None, None);
    let min = c.storage_balance_bounds().min.as_yoctonear();
    let title = "Tiny";
    let need = byte_cost(BUSINESS_BYTES + 1) + byte_cost(OBLIGATION_BYTES + title.len() as u64);
    ctx(1, biz(), need.max(min));
    c.register_business("L".into(), None);
    fund(&mut c, 5);
    ctx(2, biz(), 0);
    c.create_obligation(title.into(), U64(1000 * SEC), U128(5), None, None);
    ctx(10, usdc(), 0);
    let left = c.storage_balance_of(biz()).unwrap().available.as_yoctonear();
    assert!(left < byte_cost(RECEIPT_BYTES), "test setup should leave too little storage");
    assert_eq!(value(c.ft_on_transfer(alice(), U128(2), pay_msg(0))), Some(2));
    // Top up storage and the payment goes through.
    ctx(11, biz(), NearToken::from_near(1).as_yoctonear());
    c.storage_deposit(None, None);
    pay(&mut c, 12, alice(), 2, &pay_msg(0));
}

#[test]
fn views_list_obligations_and_businesses() {
    let c = setup(5, 5);
    assert_eq!(c.list_obligations(biz(), None, None).len(), 1);
    assert_eq!(c.list_businesses(None, None).len(), 1);
    let ob = c.get_obligation(U64(0)).unwrap();
    assert_eq!(ob.default_after_ns.0, 1100 * SEC);
    assert_eq!(ob.coverage_bps, None);
}
