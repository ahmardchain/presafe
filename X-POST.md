# Launch post on X

Published by Ahmard on 2026-11-07, with the 1:35 demo video attached: https://x.com/Ahmardchain/status/2118905952887816627. The text below is the final draft written for that post; check the live post for any edits made while publishing.

It follows the demo-post guidance in the official rules ([HACKATHON.md](https://nearhackathon.com/HACKATHON.md)):
- the first line states the user problem
- it shows one complete moment, from a payment to a refund
- it names NEAR's role concretely: a USDC bond, meta transactions, NEAR Intents
- it links the live app and the repo, and ends with a genuine question
- it tags @NEARProtocol and #NEARHackathon, plus the optional @NearLegion and @NearBuilders

## Post text

```text
You paid for the festival ticket. The festival got cancelled. Now try getting your money back.

In New York, the organizers of the cancelled Evolutions Festival are being sued over about $264K in ticket and vendor money. Of 521 ticket buyers, 11 got refunds, and only by fighting their card companies. No escrow, no financial protection, nothing set aside.

It's not just festivals. Tours, courses, custom orders: you pay first, the business spends it, and if they don't deliver you're an unsecured creditor.

Escrow isn't the answer either. Organizers need presale cash to pay venues and artists, so they won't lock it up.

So I built Presafe for #NEARHackathon (Real-World Money track).

How it works:

1. The business posts a USDC bond on @NEARProtocol and gets a public badge. Anyone can check it, no wallet needed.

2. A customer buys a ticket and sees, before paying, exactly how much they could claim back. The money goes straight to the business. It's not escrow; only the bond waits.

3. If the business delivers, the bond unlocks. If the deadline passes and nothing happens, anyone can open claims, and each customer taps Claim and gets paid back from the bond.

The customer never needs a wallet or gas. They sign in the browser, and Presafe's relayer submits it as a NEAR meta transaction. In the demo, the customer's NEAR balance doesn't move at all.

They don't even need to be on NEAR. With NEAR Intents, someone holding USDC on Base, Arbitrum, Ethereum or Solana pays straight into the contract, with the payment details attached. I tested it on mainnet with $1 from Base: it landed in about 30 seconds.

Live on testnet (test USDC): bonds, public badges, pay, missed-deadline claims and a business dashboard. Try it, no wallet needed:
https://presafe.ahmardchain.workers.dev

Code: https://github.com/ahmardchain/presafe

Event organizers, tour operators, anyone who gets paid before they deliver: would a public bond badge help you sell more presales? What would stop you from posting one?

@NearLegion @NearBuilders
```

## Sources behind the claims

- 11 of 521 refunded: [FingerLakes1, 2026-09-30](https://www.fingerlakes1.com/2026/09/30/new-york-sues-canceled-festival-promoters-over-refunds/).
- "Doesn't move at all": on testnet, the customer's NEAR balance was the same after paying and claiming ([claim tx](https://testnet.nearblocks.io/txns/5RpNDfE2D8wjtvPQyh6GQrLJGqKQ789UzbXwXENKYGv)).
- "Tested on mainnet with $1 from Base": 1Click delivery [`94gPxba…`](https://nearblocks.io/txns/94gPxbaXa8cs4noBg1XvRNZF84TSi1HDJ3G1UVziCCSg).
