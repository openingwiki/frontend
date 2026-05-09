import type { NextApiRequest, NextApiResponse } from "next";
import {
  backendUrl,
  buildCsrfHeaders,
  copyBackendCookies,
  readBackendError,
} from "@/lib/api-proxy";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const title = typeof req.body?.title === "string" ? req.body.title : "";
  const youtubeUrl = typeof req.body?.youtube_url === "string" ? req.body.youtube_url : "";
  const animeName = typeof req.body?.anime === "string" ? req.body.anime : "";
  const singerName = typeof req.body?.singer === "string" ? req.body.singer : "";
  const rawKind = typeof req.body?.kind === "string" ? req.body.kind : "opening";
  const kind = ["opening", "ending", "ost"].includes(rawKind) ? rawKind : "opening";

  const upstream = await fetch(backendUrl("/openings"), {
    method: "POST",
    headers: buildCsrfHeaders(req.headers.cookie, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      title,
      youtube_url: youtubeUrl,
      kind,
      anime: {
        mode: "create",
        name: animeName,
      },
      singer: {
        mode: "create",
        name: singerName,
      },
    }),
  });

  copyBackendCookies(res, upstream);

  if (!upstream.ok) {
    const message = await readBackendError(upstream);
    return res.redirect(302, `/submit?error=${encodeURIComponent(message)}`);
  }

  return res.redirect(302, `/?kind=${encodeURIComponent(kind)}`);
}
