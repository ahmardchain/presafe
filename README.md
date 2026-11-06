# Presafe

> **Status: in development for NEAR HACKATHON (track `realworld`).** Sections marked _TBD_ are filled in as each part ships. Nothing below claims a feature that is not built yet.

A business that takes customers' money upfront posts a stablecoin bond on NEAR and gets a public, verifiable badge. If it does not deliver by the promised date, the customers it took money from claim from the bond, without holding gas, and they can pay in from any chain.

## The problem

Businesses take customers' money upfront (festival and event tickets, tours, courses, custom orders), spend it, then fail to deliver. Customers end up as unsecured creditors.

- **United States.** New York's attorney general sued the organizers of the cancelled Evolutions Festival over about $264K in ticket and vendor money. Only 11 of 521 buyers were refunded, and only by disputing card charges. The state says no escrow or required financial protection was held, and asks for a $500K performance bond. ([FingerLakes1, 2026-09-30](https://www.fingerlakes1.com/2026/09/30/new-york-sues-canceled-festival-promoters-over-refunds/))
- **South Africa.** The Hey Neighbour festival was cancelled and promised refunds were still unpaid. ([Daily Maverick, 2025-10-27](https://www.dailymaverick.co.za/article/2025-10-27-organisers-of-hey-neighbour-festival-under-fire-refund-promises-fall-flat-for-fans))
- **Australia.** Bluesfest went into liquidation, and ticket holders are unsecured creditors. _(Primary source link TBD.)_

**Why a bond and not escrow.** Escrow locks presale cash that organizers need to pay venues and artists, so they avoid it. A bond lets the business keep and use the customer's money while customers stay protected up to the bond. Regulators already use bonds (New York's demand above; travel protection schemes such as the UK's ATOL), but they are paperwork-heavy and hard for small businesses to get.

## Verify in 2 minutes

_TBD once the testnet contract and the badge page are live._

1. **No wallet needed.** Open the badge page of the demo business: `<URL TBD>/b/<account TBD>` → you see the bond size, the coverage ratio per obligation, and the claims paid.
2. **Contract state.** Run `<view command TBD>` → you see the same numbers straight from the chain.
3. **Transactions.** See the table below.

| Step | Network | Transaction |
| --- | --- | --- |
| Business funds bond | testnet | _TBD_ |
| Customer pays with protection | testnet | _TBD_ |
| Default triggered | testnet | _TBD_ |
| Gasless claim (meta transaction) | testnet | _TBD_ |
| Any-chain pay-in through 1Click | mainnet | _TBD_ |

## How NEAR is used

| NEAR feature | What Presafe does with it |
| --- | --- |
| NEP-141 fungible tokens (USDC) | Bonds and payments are stablecoin transfers into the Presafe contract through `ft_transfer_call`. Mainnet USDC is `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`; testnet uses a mock NEP-141 token. |
| NEAR Intents (1Click API) | A customer pays, or a business funds its bond, from another chain and token. 1Click swaps it into USDC on NEAR. _Delivery design: see [Spike: 1Click into the contract](#spike-1click-into-the-contract)._ |
| Meta transactions (NEP-366) | Customers dispute and claim through a self-hosted relayer, so they do not need NEAR for gas. |
| Named accounts | The badge identity is a readable account such as `<business>.near`, shown on the badge page and in the embeddable SVG. |

## Architecture

_Draft; updated as components land._

```mermaid
flowchart LR
  subgraph Customer
    W[Wallet / app key]
  end
  subgraph Business
    BW[Wallet]
  end
  OC[1Click API<br/>any chain to USDC on NEAR]
  R[Relayer<br/>Presafe methods only]
  C[(Presafe contract)]
  U[(USDC NEP-141)]
  Web[Web app<br/>badge, pay, claims]

  BW -- ft_transfer_call fund_bond --> U
  W -- ft_transfer_call pay --> U
  U -- ft_on_transfer --> C
  C -- forwards payment --> BW
  W -- signed delegate: dispute / claim --> R --> C
  C -- claim payout ft_transfer --> U
  OC -- delivers USDC --> U
  Web -- view calls --> C
```

## Contract rules

_The contract is not built yet. This table is the specification it will be tested against._

| Action | Who | When | Effect |
| --- | --- | --- | --- |
| `fund_bond` (via `ft_transfer_call`) | Business | Any time | Adds USDC to the business's unlocked bond. Other tokens are refunded. |
| `create_obligation` | Business | Unlocked bond ≥ reserved amount | Reserves part of the bond for one obligation (for example, an event). |
| `pay` (via `ft_transfer_call`) | Customer | Obligation `Open` | Forwards the payment to the business immediately and records a covered receipt. |
| `mark_delivered` | Business | After `deliver_by` | Opens the challenge window. |
| `dispute` | Receipt holder | During the challenge window | If disputes reach the threshold (holders of ≥ 20% of covered value), the status becomes `Disputed`. |
| `resolve` | Arbiter | `Disputed` | Sets `Delivered` or `Defaulted`. |
| `trigger_default` | Anyone | `deliver_by` + grace passed and not marked delivered | Sets `Defaulted`. |
| `claim` | Receipt holder | `Defaulted` | Pays `min(receipt amount, pro-rata share of reserved bond)`. Each receipt can be claimed once. |
| Release | Business | `Delivered` and the challenge window closed with no successful dispute | Reserved bond unlocks back to the business. |
| `withdraw_bond` | Business | Any time | Withdraws unlocked bond only. |

Coverage ratio = reserved bond / total covered prepayments. Payments are not blocked when coverage is below 100%; the ratio is shown before paying.

## Local setup

_TBD._ Planned layout:

```
contract/   Rust contract (near-sdk), unit and sandbox integration tests
relayer/    Meta transaction relayer, restricted to the Presafe contract
web/        Next.js app (badge, business, pay, claims pages)
spike/      Day-1 experiment: 1Click delivery into a contract (not part of the product)
```

## Environment variables

See [`.env.example`](.env.example). Real values go in `.env`, which is git-ignored.

| Variable | Required | Purpose |
| --- | --- | --- |
| `ONECLICK_API_BASE` | yes | 1Click API base URL (`https://1click.chaindefuser.com`). |
| `ONECLICK_JWT` | no | 1Click API key. When empty, the app calls 1Click without a key, and 1Click charges its unauthenticated fee (see [Fees](https://docs.near-intents.org/resources/fees.md)). |
| `NEAR_NETWORK` | yes | `testnet` or `mainnet`. |
| `NEAR_RPC_URL` | yes | RPC endpoint, for example `https://test.rpc.fastnear.com`. |

## Tests

_TBD._

## Spike: 1Click into the contract

_In progress._ The question: can USDC delivered by 1Click arrive in the Presafe contract already tied to a specific obligation? The 1Click quote API has an experimental `customRecipientMsg` field that delivers through `ft_transfer_call` instead of `ft_transfer`. The spike tests it with a $1 mainnet payment into a throwaway contract that only records what it receives. Results and the chosen design go here.

## Disclosures

- **All code in this repository was written during NEAR HACKATHON** (the window opened 2026-10-19). No code is reused from the author's earlier projects, including the "Climb" escrow contract on Arc.
- **Other hackathon entries:** Presafe is the author's only NEAR HACKATHON entry.
- **AI assistance:** built with Claude Code.
- **Libraries and templates:** _list kept current as dependencies are added._

| Library | Version | Used for |
| --- | --- | --- |
| _TBD_ | | |

## Known limitations

- **Arbiter trust.** A disputed delivery is settled by an arbiter account (by default one run by Presafe). Customers trust that arbiter.
- **Non-event obligations.** The default rule is date-based. Services without a clear delivery date need a different claim rule.
- **Coverage below 100%.** If the bond is smaller than the covered prepayments, each claim is paid pro rata and customers recover only part of their money.
- **No Intents testnet.** The contract flow runs on testnet; the 1Click leg can only be shown on mainnet with small amounts.

## License

[MIT](LICENSE)
