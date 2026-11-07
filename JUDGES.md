# Presafe: judge run-through

Every step below runs on the live app on NEAR testnet with test USDC. You need no wallet, no NEAR and no crypto. Each step says what to do and what you should see.

- **Live app:** https://presafe.ahmardchain.workers.dev
- **Contract:** [`presafe-app.testnet`](https://testnet.nearblocks.io/address/presafe-app.testnet)
- **Demo video (1:35):** https://x.com/Ahmardchain/status/2118905952887816627

Total time is about 10 minutes, most of it waiting for a 3-minute deadline to pass.

## 1. Check a business's bond (30 seconds, read only)

**Do:** open https://presafe.ahmardchain.workers.dev/b/lagos-sound-fest.testnet

**See:**
- A one-line status for the business, such as "Claims open: a delivery was missed. 5 claims paid so far."
- Four numbers: **Bond** (USDC locked as a guarantee), **Prepayments covered** (total customers have paid in, and from how many payments), **Claims paid** (receipts paid back from the bond, and the amount), and **Arbiter**.
- A list of obligations (events), newest first, each with its reserve, coverage, deadline and customer payments.

All of this is read live from the contract. To confirm, compare it with the raw contract data:

```bash
curl -s https://test.rpc.fastnear.com -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"query","params":{"request_type":"call_function","finality":"final","account_id":"presafe-app.testnet","method_name":"get_business","args_base64":"eyJhY2NvdW50X2lkIjoibGFnb3Mtc291bmQtZmVzdC50ZXN0bmV0In0="}}' | python3 -c "import json,sys; print(bytes(json.load(sys.stdin)['result']['result']).decode())"
```

`bond_total`, `total_covered`, `claims_paid_count` and `claims_paid_amount` (6 decimals) match the page.

**Also:** open https://presafe.ahmardchain.workers.dev/b/lagos-sound-fest.testnet/badge.svg. You see the embeddable badge image a business would put on its ticket page.

## 2. Pay with protection (1 minute, no wallet, no gas)

**Do:** open https://presafe.ahmardchain.workers.dev/pay/8 (the "Main Stage (Dec 20)" obligation, open until 2026-12-20). Keep the amount at 2.00 and tap **Pay 2.00 test USDC**.

**See:**
- Before paying: "You can claim up to … of 2.00", the amount you'd get back from the bond.
- After a few seconds: **"You're covered."** with **See your receipt** and **Transaction** buttons.
- No wallet popup and no gas. Your browser generated a key, Presafe's relayer funded a fresh account with 0.01 testnet NEAR, minted 2 test USDC for you, and submitted your signed payment as a NEP-366 meta transaction.

**Check:** tap **Transaction**. On nearblocks, the transaction is signed by `presafe-relayer.testnet` and contains a delegate action from your 64-character account: `ft_transfer_call` to `presafe-app.testnet`.

## 3. Pay from another chain (30 seconds, preview)

**Do:** on the same page, scroll to **Pay from another chain**. Pick **USDC on Base** and an amount.

**See:** a live NEAR Intents 1Click quote, such as "2.0 USDC on Base → 1.99… USDC on NEAR · about 35s", delivered with msg `{"action":"pay","obligation_id":8}`.

This is a `dry: true` quote: NEAR Intents has no testnet, so the demo creates no deposit address. The same route was run on mainnet with real money: 1.00 USDC from Base was delivered into a contract with the payment details attached ([`94gPxba…`](https://nearblocks.io/txns/94gPxbaXa8cs4noBg1XvRNZF84TSi1HDJ3G1UVziCCSg)). See "Key design decision" in the [README](README.md#key-design-decision-1click-delivers-straight-into-the-contract).

## 4. A missed deadline and a gasless claim (about 6 minutes)

**Do:**
1. Open https://presafe.ahmardchain.workers.dev/business and tap **Start demo business**. The relayer funds a testnet account for it.
2. Register the business, tap **Get 10 test USDC**, then **Fund bond**.
3. Create an obligation with the **In 3 min (demo)** deadline, then tap **Copy pay link**.
4. Open the pay link in the same browser and pay, as in step 2.
5. Wait about 4 minutes (a 3-minute deadline plus a short grace period).
6. Open https://presafe.ahmardchain.workers.dev/claims.

**See:**
- Your receipt shows **Deadline missed: open claims**. Tap it. Anyone may do this once the deadline and grace period have passed.
- A **Claim** button appears. Tap it.
- **"Paid back"**: your test USDC returns from the business's bond. Your NEAR balance doesn't change, because the relayer paid the gas.
- Back on your business's badge page (`/b/<your account>`), the status now says claims are open and shows the claim paid.

## 5. Contract tests (optional, about 5 minutes)

**Do:** with Rust 1.97, the `wasm32-unknown-unknown` target and `cargo-near` 0.23.0 installed:

```bash
contract/run-tests.sh
```

**See:** `34 passed` (Presafe unit tests), `3 passed` (mock token), then `4 passed` (sandbox integration tests with real cross-contract calls, including a claim relayed as a meta transaction). The same run is in [GitHub Actions](https://github.com/ahmardchain/presafe/actions/workflows/contract-tests.yml).

## What is real and what is a demo stand-in

- **Real:** the contract on testnet; the meta transactions; the relayer; the live 1Click quotes; the mainnet 1Click delivery.
- **Stand-ins:** the test USDC (`presafe-musdc.testnet`, our own token with an open capped mint); the demo business, which is fictional; the testnet faucet built into the app.

The full audit is in the [README](README.md#whats-real-vs-mock).

## If something doesn't work

- **"Paying…" spins for more than a minute:** testnet RPC can be slow. Reload; your receipt appears on `/claims` if the payment went through.
- **No Claim button yet:** the deadline plus grace period hasn't passed. The receipt shows when claims open.
- **Different browser:** customer keys live in one browser's storage. Use the same browser for paying and claiming, or move the key with **Copy recovery key** and **Restore** on `/claims`.
