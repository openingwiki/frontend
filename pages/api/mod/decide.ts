import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

const VALID_TYPES = new Set(["opening", "anime", "singer"]);
const VALID_ACTIONS = new Set(["approve", "reject"]);

// Single proxy that handles approve/reject across all entity types so we
// don't have to maintain six near-identical files. The form posts:
//   type=opening&action=approve&id=…[&reason=…]
// and we forward to /mod/{type}/{id}/{action}.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const type = String(req.body?.type ?? "");
  const action = String(req.body?.action ?? "");
  const id = String(req.body?.id ?? "");
  const reason =
    typeof req.body?.reason === "string" ? req.body.reason.trim() : "";

  if (!VALID_TYPES.has(type) || !VALID_ACTIONS.has(action) || !id) {
    return res.redirect(
      302,
      `/mod/queue?type=${VALID_TYPES.has(type) ? type : "opening"}&error=Invalid+request`,
    );
  }

  const path =
    type === "opening"
      ? `/mod/openings/${encodeURIComponent(id)}/${action}`
      : type === "anime"
        ? `/mod/anime/${encodeURIComponent(id)}/${action}`
        : `/mod/singers/${encodeURIComponent(id)}/${action}`;

  const init: RequestInit = {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
  };
  if (action === "reject") {
    init.body = JSON.stringify(reason ? { reason } : {});
  }

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl(path), init);
  } catch {
    return res.redirect(302, `/mod/queue?type=${type}&error=Backend+unreachable`);
  }

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.redirect(
      302,
      `/mod/queue?type=${type}&error=${encodeURIComponent(message)}`,
    );
  }

  const verb = action === "approve" ? "approved" : "rejected";
  return res.redirect(302, `/mod/queue?type=${type}&info=Item+${verb}`);
}
