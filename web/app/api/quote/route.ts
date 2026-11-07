// Dry-run 1Click quotes only (`dry: true`): no deposit address is created and nothing can be sent.
// Used by the pay page to preview paying from another chain. Optional ONECLICK_JWT (server-only).
import { MAINNET_USDC_ASSET, ONECLICK_API, ORIGINS, SPIKE } from "@/lib/oneclick";
import { rateLimited } from "@/lib/server/relayer";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`quote:${ip}`, 60)) return Response.json({ error: "rate limited" }, { status: 429 });
  let body: { origin?: string; amount?: string; obligationId?: string; payer?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad json" }, { status: 400 });
  }
  const origin = ORIGINS.find((o) => o.id === body.origin);
  if (!origin) return Response.json({ error: "unsupported origin" }, { status: 400 });
  if (!/^\d{1,12}$/.test(body.amount ?? "") || BigInt(body.amount!) === 0n) return Response.json({ error: "bad amount" }, { status: 400 });
  const payer = body.payer && /^[a-z0-9._-]{2,64}$/.test(body.payer) ? body.payer : undefined;
  // Without a known payer the preview omits it; a real payment always names the customer's account.
  const msg = JSON.stringify(payer ? { action: "pay", obligation_id: Number(body.obligationId ?? 0), payer } : { action: "pay", obligation_id: Number(body.obligationId ?? 0) });
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.ONECLICK_JWT) headers.Authorization = `Bearer ${process.env.ONECLICK_JWT}`;
  const res = await fetch(`${ONECLICK_API}/v0/quote`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100,
      originAsset: origin.id,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: MAINNET_USDC_ASSET,
      amount: body.amount,
      // Presafe is deployed on testnet; Intents is mainnet-only, so the preview targets the
      // mainnet contract that received the verified spike payment.
      recipient: SPIKE.recipient,
      recipientType: "DESTINATION_CHAIN",
      refundTo: SPIKE.recipient,
      refundType: "INTENTS",
      customRecipientMsg: msg,
      deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return Response.json({ error: json.message ?? `1Click ${res.status}` }, { status: 502 });
  const q = json.quote ?? {};
  return Response.json({
    origin: origin.label,
    amountInFormatted: q.amountInFormatted,
    amountOutFormatted: q.amountOutFormatted,
    minAmountOut: q.minAmountOut,
    timeEstimate: q.timeEstimate,
    customRecipientMsg: msg,
    authenticated: !!process.env.ONECLICK_JWT,
  });
}
