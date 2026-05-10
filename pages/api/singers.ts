import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const b = req.body ?? {};
  const upstream = await fetch(backendUrl("/singers"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      name: b.name ?? "",
      name_native: b.name_native ?? "",
      type: b.type ?? "",
      active_since: b.active_since ? Number(b.active_since) : undefined,
      bio: b.bio ?? "",
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
