import type { NextApiRequest, NextApiResponse } from "next";
import { adminDeleteOpening, ApiError } from "@/lib/api";

// POST /api/admin/opening-delete  { id }
//   → DELETE /api/v1/admin/openings/{id}
// Backend rejects non-admin sessions with 403; we forward the real status so
// the toast says "Forbidden" instead of a generic error.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
  if (!id) return res.status(400).json({ error: "id is required" });

  try {
    await adminDeleteOpening(id, req.headers.cookie);
    return res.status(204).end();
  } catch (err) {
    if (err instanceof ApiError) {
      let message = err.message;
      try {
        const parsed = JSON.parse(err.body) as { error?: { message?: string } };
        if (parsed?.error?.message) message = parsed.error.message;
      } catch {
        if (err.body) message = err.body;
      }
      return res.status(err.status || 502).json({ error: message });
    }
    return res.status(502).json({ error: "Backend unreachable" });
  }
}
