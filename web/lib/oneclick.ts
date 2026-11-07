// NEAR Intents 1Click (mainnet only; there is no Intents testnet). Verified 2026-11-06/07 against
// https://1click.chaindefuser.com/docs/v0/openapi.yaml and the live /v0/tokens list.
export const ONECLICK_API = process.env.ONECLICK_API_BASE ?? "https://1click.chaindefuser.com";
export const MAINNET_USDC_ASSET = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";

/**
 * Pay-from options shown to customers (asset ids from GET /v0/tokens, 6 decimals each).
 * All quoted fine at $1, $2 and $5 on 2026-11-07. USDT on Tron is left out: 1Click returned
 * "Temporary swap limits: minimum swap amount is $100" for it that day.
 */
export const ORIGINS = [
  { id: "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near", label: "USDC on Base" },
  { id: "nep141:arb-0xaf88d065e77c8cc2239327c5edb3a432268e5831.omft.near", label: "USDC on Arbitrum" },
  { id: "nep141:eth-0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.omft.near", label: "USDC on Ethereum" },
  { id: "nep141:sol-5ce3bf3a31af18be40ba30f721101b4341690186.omft.near", label: "USDC on Solana" },
  { id: "nep141:usdt.tether-token.near", label: "USDT on NEAR" },
] as const;

/** The verified mainnet run: 1.00 USDC on Base delivered to a recorder contract with customRecipientMsg. */
export const SPIKE = {
  recipient: "77b50b72f643edee4375fa39a256a18dd375662fdcdee44db55fdec6bb77ac4d",
  nearTx: "94gPxbaXa8cs4noBg1XvRNZF84TSi1HDJ3G1UVziCCSg",
  baseTx: "0x8c908afcb96b1267cd78a4092cd4f23863fcb6b54ed38486f5e6794041536af3",
};
