import { onboard, rateLimited } from "@/lib/server/relayer";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  try {
    const { accountId, role } = await req.json();
    const r = role === "business" ? "business" : "customer";
    if (rateLimited(`onboard:${r}:${ip}`, r === "business" ? 3 : 10)) return Response.json({ error: "rate limited" }, { status: 429 });
    return Response.json(await onboard(String(accountId), r));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
