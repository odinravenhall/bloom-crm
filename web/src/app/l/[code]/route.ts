// Lien de tracking Bloom : « /l/<code> » compte le clic puis redirige vers la page OnlyFans du lien.
const API = process.env.API_URL || "http://api:3000";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  const ua = req.headers.get("user-agent") || "";
  try {
    const r = await fetch(`${API}/api/track/hit?${new URLSearchParams({ code, ip, ua })}`, { cache: "no-store" });
    if (r.ok) {
      const { dest } = (await r.json()) as { dest: string };
      if (/^https:\/\/([\w-]+\.)*onlyfans\.com\//i.test(dest)) return Response.redirect(dest, 302);
    }
  } catch {}
  return new Response("Lien introuvable", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
}
