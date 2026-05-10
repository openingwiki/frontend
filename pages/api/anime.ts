import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body ?? {};
  const upstream = await fetch(backendUrl("/anime"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: b.name ?? "",
      title_romaji: b.title_romaji ?? "",
      title_english: b.title_english ?? "",
      title_native: b.title_native ?? "",
      year: Number(b.year) || 0,
      format: b.format ?? "",
      episodes: b.episodes ? Number(b.episodes) : undefined,
      studio: b.studio ?? "",
      reference_url: b.reference_url ?? "",
      cover_image_key: b.cover_image_key ?? "",
      notes_for_moderator: b.notes_for_moderator ?? "",
    }),
  });

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const payload = await upstream.json().catch(() => ({}));
    const message = payload?.error?.message ?? `Backend error ${upstream.status}`;
    const fields = payload?.error?.fields ?? null;
    return res.status(upstream.status).json({ error: message, fields });
  }

  const payload = await upstream.json();
  return res.status(201).json(payload.data);
}
