import type { NextApiRequest, NextApiResponse } from "next";
import { backendUrl, buildCsrfHeaders, copyBackendCookies } from "@/lib/api-proxy";

// Form-friendly logout: takes a POST from a <form>, calls the Go API to
// invalidate the session, forwards the new (cleared) Set-Cookie back to the
// browser, then redirects home.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const upstream = await fetch(backendUrl("/auth/logout"), {
      method: "POST",
      headers: buildCsrfHeaders(req.headers.cookie),
    });
    copyBackendCookies(res, upstream);
  } catch {
    // Best-effort: even if upstream is down, send the user home so the UI
    // doesn't get stuck on an error page.
  }

  return res.redirect(302, "/");
}
