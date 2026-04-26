// Next.js API route: POST /api/group-add
//
// Proxy for adding an opening to one of the authenticated user's groups.
// Forwards the session cookie so the Go backend can authorise the request.
//
// Request body:  { opening_id: string; group_id: string }
// Response:      204 No Content  |  { error: string }

import type { NextApiRequest, NextApiResponse } from "next";
import { addOpeningToGroup } from "@/lib/api";

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

  const cookie = req.headers.cookie;

  try {
    await addOpeningToGroup(opening_id, group_id, cookie);
    return res.status(204).end();
  } catch {
    // In dev/mock mode — pretend it worked so the UI flow is testable
    if (process.env.NODE_ENV !== "production") {
      return res.status(204).end();
    }
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
}
