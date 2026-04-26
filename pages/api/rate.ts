// Next.js API route: POST /api/rate, DELETE /api/rate
//
// Acts as a same-origin proxy for the Go backend's rating endpoint so the
// browser never needs to know the Go service's address — and the HTTP-only
// session cookie is automatically forwarded by the browser.
//
//   POST   /api/rate { opening_id, score }            → upsert rating
//   DELETE /api/rate?opening_id=…  (or { opening_id }) → clear rating to 0
//
// Either method returns { avg_rating, rating_count, user_score } on success.
// Backend also auto-syncs the user's "Rated" system group on both flows.

import type { NextApiRequest, NextApiResponse } from "next";
import {
  ApiError,
  deleteRating,
  listMyGroups,
  rateOpening,
  removeOpeningFromGroup,
} from "@/lib/api";
import { mockOpening, mockRateResponse } from "@/lib/mock";
import type { RateResponse } from "@/lib/types";

function forwardError(res: NextApiResponse, err: unknown) {
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
  return res.status(502).json({ error: "Rating service unreachable" });
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RateResponse | { error: string }>,
) {
  const cookie = req.headers.cookie;

  if (req.method === "DELETE") {
    const opening_id =
      (typeof req.query.opening_id === "string" ? req.query.opening_id : "") ||
      (typeof req.body?.opening_id === "string" ? req.body.opening_id : "");
    if (!opening_id.trim()) {
      return res.status(400).json({ error: "opening_id is required" });
    }
    try {
      const result = await deleteRating(opening_id, cookie);
      // Backend's DeleteRating doesn't currently touch group_openings, so the
      // opening sticks around in the user's "Rated" system group after the
      // score is cleared. Reconcile it here so the UI doesn't lie.
      try {
        const groups = await listMyGroups(cookie);
        const rated = groups.find((g) => g.is_system_rated);
        if (rated) {
          await removeOpeningFromGroup(opening_id, rated.id, cookie).catch(
            // 404 just means the opening wasn't there — nothing to clean up.
            (e) => {
              if (!(e instanceof ApiError) || e.status !== 404) throw e;
            },
          );
        }
      } catch {
        // Cleanup is best-effort — don't fail the rating delete because of it.
      }
      return res.status(200).json(result);
    } catch (err) {
      return forwardError(res, err);
    }
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { opening_id, score } = req.body ?? {};

  if (typeof opening_id !== "string" || opening_id.trim() === "") {
    return res.status(400).json({ error: "opening_id is required" });
  }
  if (typeof score !== "number" || score < 1 || score > 10 || !Number.isInteger(score)) {
    return res.status(400).json({ error: "score must be an integer between 1 and 10" });
  }

  try {
    const result = await rateOpening({ opening_id, score }, cookie);
    return res.status(200).json(result);
  } catch (err) {
    // Dev fallback so the UI stays usable when the Go API is offline.
    if (process.env.NODE_ENV !== "production") {
      const op = mockOpening(opening_id);
      if (op) return res.status(200).json(mockRateResponse(score, op));
    }
    return forwardError(res, err);
  }
}
