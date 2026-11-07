import { checkPolicy, decodeSignedDelegate, rateLimited, relay } from "@/lib/server/relayer";

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (rateLimited(`relay:${ip}`, 60)) return Response.json({ error: "rate limited" }, { status: 429 });
  let sd;
  try {
    const { signedDelegate } = await req.json();
    sd = decodeSignedDelegate(String(signedDelegate));
  } catch {
    return Response.json({ error: "bad signedDelegate" }, { status: 400 });
  }
  const refused = checkPolicy(sd);
  if (refused) return Response.json({ error: refused }, { status: 403 });
  try {
    return Response.json(await relay(sd));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
