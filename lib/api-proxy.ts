import type { IncomingMessage, ServerResponse } from "http";
import type { NextApiResponse } from "next";

const API_ORIGIN = process.env.API_BASE_URL || "http://localhost:8080";
const API_PREFIX = "/api/v1";
const CSRF_COOKIE_NAME = "ow_csrf";
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 2000);

export function backendUrl(path: string): string {
  return `${API_ORIGIN}${API_PREFIX}${path}`;
}

export function copyBackendCookies(res: NextApiResponse, upstream: Response) {
  // Use getSetCookie() so multiple Set-Cookie headers (session + csrf) survive
  // the round-trip — .get('set-cookie') in undici concatenates them with a
  // comma, which browsers refuse to split back into separate cookies.
  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : ([upstream.headers.get("set-cookie")].filter(Boolean) as string[]);
  if (setCookies.length === 0) return;
  res.setHeader("set-cookie", setCookies);
}

export function getCsrfTokenFromCookieHeader(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === CSRF_COOKIE_NAME) {
      return rest.join("=") || null;
    }
  }

  return null;
}

export function buildCsrfHeaders(
  cookieHeader?: string,
  baseHeaders: Record<string, string> = {},
): Record<string, string> {
  const headers = { ...baseHeaders };
  const csrfToken = getCsrfTokenFromCookieHeader(cookieHeader);

  if (cookieHeader) {
    headers.cookie = cookieHeader;
  }
  if (csrfToken) {
    headers["X-CSRF-Token"] = csrfToken;
  }

  return headers;
}

export async function ensureCsrfCookie(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(backendUrl("/healthz"), {
      method: "GET",
      headers: req.headers.cookie ? { cookie: req.headers.cookie } : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  const setCookies =
    typeof upstream.headers.getSetCookie === "function"
      ? upstream.headers.getSetCookie()
      : ([upstream.headers.get("set-cookie")].filter(Boolean) as string[]);
  if (setCookies.length === 0) return;

  const current = res.getHeader("set-cookie");
  const merged: string[] = [];
  if (Array.isArray(current)) merged.push(...current.map(String));
  else if (current) merged.push(String(current));
  merged.push(...setCookies);
  res.setHeader("set-cookie", merged);
}

export async function readBackendError(upstream: Response): Promise<string> {
  try {
    const payload = await upstream.json();
    if (payload?.error?.message) return payload.error.message;
  } catch {
    // Ignore malformed upstream payloads and return a generic message below.
  }

  return `Backend request failed with ${upstream.status}`;
}
