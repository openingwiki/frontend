// Next.js API route: POST /api/rate
//
// Acts as a same-origin proxy for the Go backend's rating endpoint so the
// browser never needs to know the Go service's address — and the HTTP-only
// session cookie (set by Go) is automatically forwarded by the browser to
// this route, which we then forward to Go.
//
// Request body:  { opening_id: string; score: number }
// Response:      { avg_rating, rating_count, user_score }  |  { error: string }

import type { NextApiRequest, NextApiResponse } from "next";
import { rateOpening } from "@/lib/api";
import { mockOpening, mockRateResponse } from "@/lib/mock";
import type { RateResponse } from "@/lib/types";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RateResponse | { error: string }>,
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { opening_id, score } = req.body ?? {};

  if (typeof opening_id !== "string" || opening_id.trim() === "") {
    return res.status(400).json({ error: "opening_id is required" });
  }
  if (typeof score !== "number" || score < 1 || score > 10 || !Number.isInteger(score)) {
    return res.status(400).json({ error: "score must be an integer between 1 and 10" });
  }

  const cookie = req.headers.cookie;

  try {
    const result = await rateOpening({ opening_id, score }, cookie);
    return res.status(200).json(result);
  } catch {
    // Go API offline — return a mock response so the UI stays functional
    // during local development. Remove this fallback once the API is stable.
    if (process.env.NODE_ENV !== "production") {
      const op = mockOpening(opening_id);
      if (op) {
        return res.status(200).json(mockRateResponse(score, op));
      }
    }
    return res.status(503).json({ error: "Rating service temporarily unavailable" });
  }
}
