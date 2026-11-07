import { onboard, rateLimited } from "@/lib/server/relayer";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`onboard:${ip}`, 10)) return Response.json({ error: "rate limited" }, { status: 429 });
  try {
    const { accountId } = await req.json();
    return Response.json(await onboard(String(accountId)));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
