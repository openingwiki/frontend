// Next.js API route: POST /api/group-remove
//
// Proxy for removing an opening from one of the authenticated user's groups.
// Mirrors group-add.ts.

import type { NextApiRequest, NextApiResponse } from "next";
import { removeOpeningFromGroup } from "@/lib/api";

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
  } catch {
    return res.status(503).json({ error: "Service temporarily unavailable" });
  }
}
