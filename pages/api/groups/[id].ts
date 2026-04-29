import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = typeof req.query.id === "string" ? req.query.id : "";
  if (!id) {
    return res.status(400).json({ error: "Group id is required" });
  }

  if (req.method !== "PATCH") {
    res.setHeader("Allow", "PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const description =
    typeof req.body?.description === "string" ? req.body.description : "";
  const isPublic = req.body?.is_public === true || req.body?.is_public === "on";

  if (!name) return res.status(422).json({ error: "Group name is required" });
  if (name.length > 80) return res.status(422).json({ error: "Name too long (max 80)" });

  const upstream = await fetch(backendUrl(`/me/groups/${encodeURIComponent(id)}`), {
    method: "PATCH",
    headers: buildCsrfHeaders(req.headers.cookie, { "Content-Type": "application/json" }),
    body: JSON.stringify({ name, description, is_public: isPublic }),
  });
  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.status(upstream.status).json({ error: message });
  }

  const payload = await upstream.json().catch(() => ({}));
  return res.status(200).json(payload?.data ?? payload);
}
