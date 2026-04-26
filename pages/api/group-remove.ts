// Next.js API route: POST /api/group-remove
//
// Proxy for removing an opening from one of the authenticated user's groups.
// Mirrors group-add.ts.

import type { NextApiRequest, NextApiResponse } from "next";
import { ApiError, removeOpeningFromGroup } from "@/lib/api";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<void | { error: string }>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { opening_id, group_id } = req.body ?? {};
  if (typeof opening_id !== "string" || opening_id.trim() === "") {
    return res.status(400).json({ error: "opening_id is required" });
  }
  if (typeof group_id !== "string" || group_id.trim() === "") {
    return res.status(400).json({ error: "group_id is required" });
  }

  try {
    await removeOpeningFromGroup(opening_id, group_id, req.headers.cookie);
    return res.status(204).end();
  } catch (err) {
    // Forward the actual backend error so the toast says something useful
    // instead of a generic "Service temporarily unavailable".
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
