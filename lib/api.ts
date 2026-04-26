// Server-side Go API client.
// Used exclusively from getServerSideProps / API routes — never imported into
// browser bundles. Forwards the user's session cookie so the API can identify
// them (REQUIREMENTS §1: secure HTTP-only cookies issued by the Go service).

import type {
  Group,
  Opening,
  OpeningPage,
  SortKey,
  User,
} from "./types";

const BASE = process.env.API_BASE_URL || "http://localhost:8080";

interface FetchOpts extends RequestInit {
  cookie?: string;
}

async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (opts.cookie) headers.cookie = opts.cookie;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    // SSR: never cache — every request is per-user.
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, `${path} → ${res.status} ${res.statusText}`, body);
  }
  return (await res.json()) as T;
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: string) {
    super(message);
    this.name = "ApiError";
  }
}

// -- Endpoints ----------------------------------------------------------------

export interface ListOpeningsParams {
  q?: string;
  sort?: SortKey;
  page?: number;
  cookie?: string;
}

export async function listOpenings(p: ListOpeningsParams = {}): Promise<OpeningPage> {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.sort) qs.set("sort", p.sort);
  if (p.page) qs.set("page", String(p.page));
  const query = qs.toString();
  return apiFetch<OpeningPage>(`/openings${query ? `?${query}` : ""}`, { cookie: p.cookie });
}

export function getOpening(id: string, cookie?: string): Promise<Opening> {
  return apiFetch<Opening>(`/openings/${encodeURIComponent(id)}`, { cookie });
}

export function getMe(cookie?: string): Promise<User | null> {
  return apiFetch<User>("/me", { cookie }).catch((e) => {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  });
}

export function listMyGroups(cookie?: string): Promise<Group[]> {
  return apiFetch<Group[]>("/me/groups", { cookie });
}

// -- Stats (used by the home-page subtitle: "2,418 openings · 412 anime · 287 singers")
export interface CatalogStats {
  openings: number;
  anime: number;
  singers: number;
}

export function getStats(cookie?: string): Promise<CatalogStats> {
  return apiFetch<CatalogStats>("/stats", { cookie });
}

// -- Moderation queue count (for the role bar)
export function getModerationQueueCount(cookie?: string): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/mod/queue/count", { cookie });
}
