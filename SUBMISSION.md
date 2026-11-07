# NEAR HACKATHON submission

Submitted through the official submission API (`POST https://nearhackathon.com/api/applications`) on 2026-11-07. The server answered `201` (saved). This file mirrors the public fields. The contact email is left out on purpose, as the rules ask that the payload not be committed because it contains personal data.

The rules allow one submission per project. Corrections go through https://nearhackathon.com/request-changes, never a second submission.

| Field | Value |
| --- | --- |
| Project name | Presafe |
| Team lead | Ahmad Aminu |
| Team size | 1 |
| Tracks | `realworld` (Real-World Money) |
| NEAR payout account (mainnet) | `ahmardchain.near` |
| Repository | https://github.com/ahmardchain/presafe |
| Demo post | https://x.com/Ahmardchain/status/2118905952887816627 |
| Consent to the contact notice | Given |

## What we built (as submitted)

Problem: people pay upfront for festival tickets, tours, courses and custom orders, and when the business doesn't deliver they usually lose the money. When New York's Evolutions Festival was cancelled, 11 of 521 ticket buyers got refunds, only through card disputes. Escrow doesn't fit: organizers need presale cash to pay venues and artists.

Product: Presafe. A business posts a USDC bond in a Rust contract on NEAR and gets a public badge, read live from the contract, that anyone can check without a wallet. Customers pay the business directly: the money is spendable at once, and only the bond waits. Each payment records a receipt showing how much the customer can claim back. If the business marks the order delivered and no dispute passes, the bond is released. If the deadline and grace period pass, anyone can open claims and each customer claims their share of the bond.

How NEAR fits in: customers never need a wallet or gas. A key generated in the browser signs NEP-366 delegate actions, and Presafe's relayer submits them as meta transactions for paying, disputing and claiming. Customers holding USDC on Base, Arbitrum, Ethereum or Solana can pay through NEAR Intents 1Click: the quote delivers USDC straight into the contract with customRecipientMsg naming the obligation and the payer. This was verified on mainnet with 1 USDC from Base (tx 94gPxbaXa8cs4noBg1XvRNZF84TSi1HDJ3G1UVziCCSg). The live app runs on NEAR testnet with a test USDC token: https://presafe.ahmardchain.workers.dev

## Links for judges

- Live app: https://presafe.ahmardchain.workers.dev
- Judge run-through: [JUDGES.md](JUDGES.md)
- README: [README.md](README.md)
