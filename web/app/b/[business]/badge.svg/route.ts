import { amount, headline } from "@/lib/format";
import { getBusiness, listObligations } from "@/lib/near";

export const dynamic = "force-dynamic";

const COLORS = { protected: "#0F7B5F", partial: "#B7791F", claims: "#C2410C", delivered: "#14161A", neutral: "#14161A" };
const LABEL = { protected: "Protected by Presafe", partial: "Partly protected", claims: "Claims open", delivered: "Protected by Presafe", neutral: "Presafe" };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export async function GET(_req: Request, { params }: { params: Promise<{ business: string }> }) {
  const { business } = await params;
  const b = await getBusiness(business).catch(() => null);
  let tone: keyof typeof COLORS = "neutral";
  let right = "Not registered";
  if (b) {
    const obs = await listObligations(business);
    tone = headline(b, obs).tone;
    const live = obs.filter((o) => o.status !== "Delivered");
    const covered = live.reduce((s, o) => s + BigInt(o.covered_total), 0n);
    const reserved = live.reduce((s, o) => s + BigInt(o.reserve), 0n);
    const cov = covered === 0n ? "" : ` · ${Number((reserved * 100n) / covered)}% covered`;
    right = tone === "claims" ? `${b.claims_paid_count} claim${b.claims_paid_count === 1 ? "" : "s"} paid` : `${amount(b.bond_total)} bonded${cov}`;
  }
  const left = LABEL[tone];
  const lw = Math.round(32 + left.length * 7.3 + 14);
  const rw = Math.round(16 + right.length * 7.9 + 16);
  const w = Math.round(lw + rw);
  const c = COLORS[tone];
  // Ticket stub: notches on the long sides at the perforation line.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="44" viewBox="0 0 ${w} 44" role="img" aria-label="${esc(left)}: ${esc(right)}">
<title>${esc(left)}: ${esc(right)}</title>
<defs><mask id="m"><rect width="${w}" height="44" rx="7" fill="#fff"/><circle cx="${lw}" cy="0" r="6" fill="#000"/><circle cx="${lw}" cy="44" r="6" fill="#000"/></mask></defs>
<g mask="url(#m)"><rect width="${lw}" height="44" fill="${c}"/><rect x="${lw}" width="${rw}" height="44" fill="#FFFDF8"/></g>
<rect x="0.5" y="0.5" width="${w - 1}" height="43" rx="7" fill="none" stroke="${c}" mask="url(#m)"/>
<line x1="${lw}" y1="8" x2="${lw}" y2="36" stroke="${c}" stroke-dasharray="3 3"/>
<path d="M12 22.5l4 4 8-8.5" fill="none" stroke="#FFFDF8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
<g font-family="IBM Plex Sans, Segoe UI, Helvetica, Arial, sans-serif" font-size="13" font-weight="600">
<text x="32" y="27" fill="#FFFDF8">${esc(left)}</text>
<text x="${lw + 16}" y="27" fill="#14161A" font-family="IBM Plex Mono, Menlo, monospace" font-weight="500">${esc(right)}</text>
</g></svg>`;
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=30, s-maxage=30" },
  });
}
