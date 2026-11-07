# Changelog

All notable changes to Presafe. Dates are UTC.

## 2026-11-07

### Added
- README restructured for judges: a links table, badges, a requirements checklist, judging criteria alignment, "What's real vs. mock", related work, a key design decision and screenshots.
- `JUDGES.md` (a "do X, see Y" run-through), `SUBMISSION.md`, `X-POST.md` and this changelog.
- GitHub Actions workflow that builds both contracts and runs the unit and sandbox integration tests.
- Demo video (1:35), published on X.
- Pay from another chain: live NEAR Intents 1Click quotes on the pay page (`/api/quote`).
- Business page: connect a NEAR wallet, or start a testnet demo business; register, fund, create obligations, mark delivered, release, withdraw.
- Pay and claims pages with gasless actions: browser-held keys, NEP-366 delegate actions and a self-hosted relayer with an allowlist (`/api/relay`, `/api/onboard`).
- Cloudflare Workers deployment (OpenNext adapter); the live app is at https://presafe.ahmardchain.workers.dev.
- Mainnet 1Click spike: 1.00 USDC from Base delivered into a contract with `customRecipientMsg`. The funds were returned and the throwaway account deleted.

### Changed
- Badge page: the obligation field "Paid" is renamed "Customer payments", and the header notes how many customer payments make up "Prepayments covered" and how much "Claims paid" returned. Before, the sum of the per-obligation "Paid" values (customer payments) could be mistaken for claims paid.
- Missed deadlines show as such, and obligations are listed newest first.
- The landing ticket uses the featured obligation's own status and coverage.

### Removed
- Demo video production scripts.

## 2026-11-06

### Added
- Presafe contract (Rust, near-sdk 5.30.1): bonds, obligations, payments forwarded to the business at once, covered receipts, mark delivered, disputes, arbiter resolution, default, pro-rata claims, release and withdraw.
- Mock USDC (NEP-141) for testnet, plus 34 unit tests, 3 token tests and 4 near-sandbox integration tests.
- Testnet deploy and seed scripts; deployed `presafe-app.testnet`.
- Web app: landing page, live badge page and embeddable `badge.svg`.
- Mainnet 1Click spike scaffolding (`spike/`).
