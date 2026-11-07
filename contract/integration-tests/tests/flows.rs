//! End-to-end flows on a local NEAR sandbox with real cross-contract calls.
//! Prerequisite: build both wasm files (`cargo near build non-reproducible-wasm --no-embed-abi`
//! in contract/presafe and contract/mock-ft).

use near_api::types::transaction::delegate_action::SignedDelegateAction;
use near_api::types::{AccountId, Action, Data, NearGas, NearToken};
use near_api::{Account, Contract, NetworkConfig, Signer, Transaction};
use near_sandbox::config::DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY;
use near_sandbox::Sandbox;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

const USDC: u128 = 1_000_000;

struct Env {
    _sandbox: Sandbox,
    net: NetworkConfig,
    signer: Arc<Signer>,
    presafe: AccountId,
    usdc: AccountId,
    biz: AccountId,
    alice: AccountId,
    relayer: AccountId,
    arbiter: AccountId,
}

fn wasm(name: &str) -> Vec<u8> {
    let path = format!("{}/../target/near/{name}/{name}.wasm", env!("CARGO_MANIFEST_DIR"));
    std::fs::read(&path).unwrap_or_else(|_| panic!("missing {path}: build the contracts first"))
}

fn now_ns() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
}

impl Env {
    async fn new() -> anyhow::Result<Self> {
        let sandbox = Sandbox::start_sandbox().await?;
        let net = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse()?);
        let signer = Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse()?)?;
        let id = |s: &str| -> AccountId { format!("{s}.sandbox").parse().unwrap() };
        let (presafe, usdc, biz, alice, relayer, arbiter) =
            (id("presafe"), id("musdc"), id("lagos-sound-fest"), id("alice"), id("relayer"), id("arbiter"));
        for (a, near) in [(&presafe, 20), (&usdc, 10), (&biz, 10), (&alice, 1), (&relayer, 10), (&arbiter, 1)] {
            sandbox.create_account(a.as_str().parse().unwrap()).initial_balance(NearToken::from_near(near)).send().await?;
        }
        let e = Env { _sandbox: sandbox, net, signer, presafe, usdc, biz, alice, relayer, arbiter };
        e.deploy(&e.usdc, wasm("mock_ft"), "new", json!({})).await?;
        e.deploy(
            &e.presafe,
            wasm("presafe"),
            "new",
            json!({ "owner": e.presafe, "usdc": e.usdc, "default_arbiter": e.arbiter, "default_grace_ns": "1000000000" }),
        )
        .await?;
        // The Presafe contract must hold a storage registration with the token to receive it.
        e.register_with_token(&e.usdc, &e.presafe).await?;
        Ok(e)
    }

    async fn register_with_token(&self, token: &AccountId, who: &AccountId) -> anyhow::Result<()> {
        self.ok(who, token, "storage_deposit", json!({ "account_id": who, "registration_only": true }), 1_250_000_000_000_000_000_000).await?;
        Ok(())
    }

    async fn deploy(&self, account: &AccountId, code: Vec<u8>, init: &str, args: Value) -> anyhow::Result<()> {
        Contract::deploy(account.clone())
            .use_code(code)
            .with_init_call(init, args)?
            .with_signer(self.signer.clone())
            .send_to(&self.net)
            .await?
            .assert_success();
        Ok(())
    }

    async fn call(&self, who: &AccountId, contract: &AccountId, method: &str, args: Value, yocto: u128) -> anyhow::Result<near_api::types::transaction::result::ExecutionFinalResult> {
        Ok(Contract(contract.clone())
            .call_function(method, args)
            .transaction()
            .deposit(NearToken::from_yoctonear(yocto))
            .gas(NearGas::from_tgas(150))
            .with_signer(who.clone(), self.signer.clone())
            .send_to(&self.net)
            .await?
            .into_full()
            .expect("final result"))
    }

    async fn ok(&self, who: &AccountId, contract: &AccountId, method: &str, args: Value, yocto: u128) -> anyhow::Result<Value> {
        let r = self.call(who, contract, method, args, yocto).await?;
        let logs: Vec<String> = r.logs().iter().map(|s| s.to_string()).collect();
        let success = r.into_result().unwrap_or_else(|e| {
            let msg = format!("{e:?}");
            let reason = msg.split("ExecutionError(\"").nth(1).and_then(|t| t.split('"').next()).unwrap_or(&msg);
            panic!("{method} failed: {reason}\nlogs: {logs:?}")
        });
        Ok(success.json::<Value>().unwrap_or(Value::Null))
    }

    async fn view(&self, contract: &AccountId, method: &str, args: Value) -> anyhow::Result<Value> {
        let d: Data<Value> = Contract(contract.clone()).call_function(method, args).read_only().fetch_from(&self.net).await?;
        Ok(d.data)
    }

    async fn ft_balance(&self, who: &AccountId) -> anyhow::Result<u128> {
        let v = self.view(&self.usdc, "ft_balance_of", json!({ "account_id": who })).await?;
        Ok(v.as_str().unwrap().parse()?)
    }

    async fn near_balance(&self, who: &AccountId) -> anyhow::Result<u128> {
        Ok(Account(who.clone()).view().fetch_from(&self.net).await?.data.amount.as_yoctonear())
    }

    /// Mints mUSDC to `who` (registering it) and returns.
    async fn mint(&self, who: &AccountId, amount: u128) -> anyhow::Result<()> {
        self.ok(who, &self.usdc, "mint", json!({ "account_id": who, "amount": amount.to_string() }), 1_250_000_000_000_000_000_000).await?;
        Ok(())
    }

    async fn transfer_call(&self, from: &AccountId, token: &AccountId, amount: u128, msg: Value) -> anyhow::Result<Value> {
        self.ok(from, token, "ft_transfer_call", json!({ "receiver_id": self.presafe, "amount": amount.to_string(), "msg": msg.to_string() }), 1).await
    }

    /// Registers the business, funds `bond`, creates an obligation due in `due_secs` with `reserve`
    /// (challenge window 2s, grace `grace_secs`).
    async fn business_with_obligation(&self, bond: u128, reserve: u128, due_secs: u64, grace_secs: u64) -> anyhow::Result<u64> {
        self.ok(&self.biz, &self.presafe, "register_business", json!({ "name": "Lagos Sound Fest" }), NearToken::from_near(1).as_yoctonear()).await?;
        self.mint(&self.biz, bond).await?;
        self.transfer_call(&self.biz, &self.usdc, bond, json!({ "action": "fund_bond" })).await?;
        let deliver_by = now_ns() + due_secs * 1_000_000_000;
        let id = self
            .ok(&self.biz, &self.presafe, "create_obligation", json!({
                "title": "Lagos Sound Fest 2026", "deliver_by_ns": deliver_by.to_string(), "reserve": reserve.to_string(),
                "challenge_window_ns": "2000000000", "grace_ns": (grace_secs * 1_000_000_000).to_string()
            }), 0)
            .await?;
        Ok(id.as_str().unwrap().parse()?)
    }
}

#[tokio::test]
async fn pay_default_and_gasless_claim() -> anyhow::Result<()> {
    let e = Env::new().await?;
    let ob = e.business_with_obligation(5 * USDC, 5 * USDC, 8, 1).await?;
    assert_eq!(e.ft_balance(&e.biz).await?, 0, "the whole bond sits in the contract");

    // Customer pays 2 USDC; the business receives it immediately (not escrow).
    e.mint(&e.alice, 2 * USDC).await?;
    e.transfer_call(&e.alice, &e.usdc, 2 * USDC, json!({ "action": "pay", "obligation_id": ob })).await?;
    assert_eq!(e.ft_balance(&e.alice).await?, 0);
    assert_eq!(e.ft_balance(&e.biz).await?, 2 * USDC);
    let cov = e.view(&e.presafe, "get_coverage", json!({ "obligation_id": ob.to_string() })).await?;
    assert_eq!(cov["coverage_bps"], "25000");

    // Too early to default.
    let early = e.call(&e.relayer, &e.presafe, "trigger_default", json!({ "obligation_id": ob.to_string() }), 0).await?;
    assert!(early.into_result().is_err());

    // Wait past deliver_by + grace, then anyone can default.
    tokio::time::sleep(Duration::from_secs(10)).await;
    e.ok(&e.relayer, &e.presafe, "trigger_default", json!({ "obligation_id": ob.to_string() }), 0).await?;
    let biz = e.view(&e.presafe, "get_business", json!({ "account_id": e.biz })).await?;
    assert_eq!(biz["unlocked"], (3 * USDC).to_string(), "excess reserve unlocks on default");

    // Gasless claim: Alice signs a delegate action; the relayer submits and pays gas.
    let receipts = e.view(&e.presafe, "list_receipts_by_payer", json!({ "payer": e.alice })).await?;
    let rid = receipts[0]["id"].as_str().unwrap().to_string();
    assert_eq!(receipts[0]["claimable"], (2 * USDC).to_string());
    let alice_near_before = e.near_balance(&e.alice).await?;
    let meta = Contract(e.presafe.clone())
        .call_function("claim", json!({ "receipt_id": rid }))
        .transaction()
        .gas(NearGas::from_tgas(100))
        .with_signer(e.alice.clone(), e.signer.clone())
        .meta()
        .tx_live_for(120)
        .presign_with(&e.net)
        .await?;
    let signed: SignedDelegateAction = meta.transaction.signed().expect("signed delegate").clone();
    let relayed = Transaction::construct(e.relayer.clone(), e.alice.clone())
        .add_action(Action::Delegate(Box::new(signed)))
        .with_signer(e.signer.clone())
        .send_to(&e.net)
        .await?;
    relayed.assert_success();
    tokio::time::sleep(Duration::from_secs(2)).await;
    assert_eq!(e.ft_balance(&e.alice).await?, 2 * USDC, "claim paid in full (coverage 250%)");
    assert_eq!(e.near_balance(&e.alice).await?, alice_near_before, "claimant paid no gas");
    let biz = e.view(&e.presafe, "get_business", json!({ "account_id": e.biz })).await?;
    assert_eq!(biz["claims_paid_count"], 1);

    // Double claim fails.
    let again = e.call(&e.alice, &e.presafe, "claim", json!({ "receipt_id": rid }), 0).await?;
    assert!(again.into_result().is_err());
    assert_eq!(e.ft_balance(&e.alice).await?, 2 * USDC);
    Ok(())
}

#[tokio::test]
async fn wrong_token_and_bad_msg_are_refunded() -> anyhow::Result<()> {
    let e = Env::new().await?;
    let ob = e.business_with_obligation(USDC, USDC, 60, 1).await?;
    // A second token contract that is not the configured USDC.
    let fake: AccountId = "fake.sandbox".parse()?;
    e._sandbox.create_account(fake.as_str().parse().unwrap()).initial_balance(NearToken::from_near(10)).send().await?;
    e.deploy(&fake, wasm("mock_ft"), "new", json!({})).await?;
    e.register_with_token(&fake, &e.presafe).await?;
    e.ok(&e.alice, &fake, "mint", json!({ "account_id": e.alice, "amount": "1000000" }), 1_250_000_000_000_000_000_000).await?;
    e.transfer_call(&e.alice, &fake, USDC, json!({ "action": "pay", "obligation_id": ob })).await?;
    let bal: String = serde_json::from_value(e.view(&fake, "ft_balance_of", json!({ "account_id": e.alice })).await?)?;
    assert_eq!(bal, USDC.to_string(), "wrong token refunded");

    e.mint(&e.alice, USDC).await?;
    e.ok(&e.alice, &e.usdc, "ft_transfer_call", json!({ "receiver_id": e.presafe, "amount": "1000000", "msg": "not json" }), 1).await?;
    assert_eq!(e.ft_balance(&e.alice).await?, USDC, "bad msg refunded");
    Ok(())
}

#[tokio::test]
async fn named_payer_gets_the_receipt() -> anyhow::Result<()> {
    // Mirrors a 1Click delivery: some other account sends, the msg names the customer.
    let e = Env::new().await?;
    let ob = e.business_with_obligation(USDC, USDC, 60, 1).await?;
    e.mint(&e.relayer, USDC).await?;
    e.transfer_call(&e.relayer, &e.usdc, USDC, json!({ "action": "pay", "obligation_id": ob, "payer": e.alice })).await?;
    let mine = e.view(&e.presafe, "list_receipts_by_payer", json!({ "payer": e.alice })).await?;
    assert_eq!(mine.as_array().unwrap().len(), 1);
    let senders = e.view(&e.presafe, "list_receipts_by_payer", json!({ "payer": e.relayer })).await?;
    assert!(senders.as_array().unwrap().is_empty());
    Ok(())
}

#[tokio::test]
async fn delivered_release_and_withdraw() -> anyhow::Result<()> {
    let e = Env::new().await?;
    let ob = e.business_with_obligation(3 * USDC, 2 * USDC, 4, 30).await?;
    e.mint(&e.alice, USDC).await?;
    e.transfer_call(&e.alice, &e.usdc, USDC, json!({ "action": "pay", "obligation_id": ob })).await?;

    // Locked bond cannot be withdrawn.
    let locked = e.call(&e.biz, &e.presafe, "withdraw_bond", json!({ "amount": (2 * USDC).to_string() }), 1).await?;
    assert!(locked.into_result().is_err());

    tokio::time::sleep(Duration::from_secs(5)).await;
    e.ok(&e.biz, &e.presafe, "mark_delivered", json!({ "obligation_id": ob.to_string() }), 0).await?;
    tokio::time::sleep(Duration::from_secs(3)).await;
    e.ok(&e.arbiter, &e.presafe, "release", json!({ "obligation_id": ob.to_string() }), 0).await?;
    let o = e.view(&e.presafe, "get_obligation", json!({ "obligation_id": ob.to_string() })).await?;
    assert_eq!(o["status"], "Delivered");

    let before = e.ft_balance(&e.biz).await?;
    e.ok(&e.biz, &e.presafe, "withdraw_bond", json!({ "amount": (3 * USDC).to_string() }), 1).await?;
    assert_eq!(e.ft_balance(&e.biz).await? - before, 3 * USDC);
    Ok(())
}
