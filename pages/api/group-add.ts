// Next.js API route: POST /api/group-add
//
// Proxy for adding an opening to one of the authenticated user's groups.
// Forwards the session cookie so the Go backend can authorise the request.
//
// Request body:  { opening_id: string; group_id: string }
// Response:      204 No Content  |  { error: string }

import type { NextApiRequest, NextApiResponse } from "next";
import { addOpeningToGroup, ApiError } from "@/lib/api";

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
    await addOpeningToGroup(opening_id, group_id, req.headers.cookie);
    return res.status(204).end();
  } catch (err) {
    // Surface the real backend status + message so the toast says something
    // useful (e.g. "Rated group is not manually editable" vs a generic 503).
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
