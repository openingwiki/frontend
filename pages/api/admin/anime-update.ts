import type { NextApiRequest, NextApiResponse } from "next";
import { adminUpdateAnime, ApiError } from "@/lib/api";

// PATCH /api/admin/anime-update  { id, title_english, year, format, reference_url, cover_image_key }
//   → PATCH /api/v1/admin/anime/{id}
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const { id, ...input } = req.body ?? {};
  if (!id || typeof id !== "string") return res.status(400).json({ error: "id is required" });

  try {
    await adminUpdateAnime(id, input, req.headers.cookie);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof ApiError) {
      let message = err.message;
      try {
        const parsed = JSON.parse(err.body) as { error?: { message?: string; fields?: Record<string, string> } };
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (err.body) message = err.body;
      }
      return res.status(err.status || 502).json({ error: message });
    }
    return res.status(502).json({ error: "Backend unreachable" });
  }
}
