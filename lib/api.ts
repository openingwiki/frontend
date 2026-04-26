// Server-side Go API client.
// Used exclusively from getServerSideProps / API routes — never imported into
// browser bundles. Forwards the user's session cookie so the API can identify
// them (REQUIREMENTS §1: secure HTTP-only cookies issued by the Go service).

import type {
  AdjacentOpenings,
  Group,
  Opening,
  OpeningPage,
  RatePayload,
  RateResponse,
  SortKey,
  User,
  UserRating,
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

// ---------------------------------------------------------------------------
// Openings
// ---------------------------------------------------------------------------

export interface ListOpeningsParams {
  q?: string;
  sort?: SortKey;
  page?: number;
  cookie?: string;
}

export function listOpenings(p: ListOpeningsParams = {}): Promise<OpeningPage> {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.sort) qs.set("sort", p.sort);
  if (p.page) qs.set("page", String(p.page));
  const query = qs.toString();
  return apiFetch<OpeningPage>(`/openings${query ? "?" + query : ""}`, { cookie: p.cookie });
}

export function getOpening(id: string, cookie?: string): Promise<Opening> {
  return apiFetch<Opening>(`/openings/${encodeURIComponent(id)}`, { cookie });
}

// GET /openings/:id/adjacent?sort=&q=
// Returns the prev/next openings in the given sorted/filtered view.
export function getAdjacentOpenings(
  id: string,
  params: { sort?: SortKey; q?: string } = {},
  cookie?: string,
): Promise<AdjacentOpenings> {
  const qs = new URLSearchParams();
  if (params.sort) qs.set("sort", params.sort);
  if (params.q) qs.set("q", params.q);
  const query = qs.toString();
  return apiFetch<AdjacentOpenings>(
    `/openings/${encodeURIComponent(id)}/adjacent${query ? "?" + query : ""}`,
    { cookie },
  );
}

// GET /openings/:id/my-rating  — returns 404 when not yet rated (null).
export function getMyRating(id: string, cookie?: string): Promise<UserRating | null> {
  return apiFetch<UserRating>(`/openings/${encodeURIComponent(id)}/my-rating`, { cookie }).catch(
    (e) => {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    },
  );
}

// ---------------------------------------------------------------------------
// Rating
// ---------------------------------------------------------------------------

// POST /openings/:id/rate  { score: 1-10 }
// Called server-side from pages/api/rate.ts which forwards the session cookie.
export function rateOpening(payload: RatePayload, cookie?: string): Promise<RateResponse> {
  return apiFetch<RateResponse>(
    `/openings/${encodeURIComponent(payload.opening_id)}/rate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ score: payload.score }),
      cookie,
    },
  );
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export function listMyGroups(cookie?: string): Promise<Group[]> {
  return apiFetch<Group[]>("/me/groups", { cookie });
}

// POST /groups/:groupId/openings  { opening_id }
export function addOpeningToGroup(
  openingId: string,
  groupId: string,
  cookie?: string,
): Promise<void> {
  return apiFetch<void>(`/groups/${encodeURIComponent(groupId)}/openings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opening_id: openingId }),
    cookie,
  });
}

// DELETE /groups/:groupId/openings/:openingId
export function removeOpeningFromGroup(
  openingId: string,
  groupId: string,
  cookie?: string,
): Promise<void> {
  return apiFetch<void>(
    `/groups/${encodeURIComponent(groupId)}/openings/${encodeURIComponent(openingId)}`,
    { method: "DELETE", cookie },
  );
}

// ---------------------------------------------------------------------------
// Users / session
// ---------------------------------------------------------------------------

export function getMe(cookie?: string): Promise<User | null> {
  return apiFetch<User>("/me", { cookie }).catch((e) => {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  });
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface CatalogStats {
  openings: number;
  anime: number;
  singers: number;
}

export function getStats(cookie?: string): Promise<CatalogStats> {
  return apiFetch<CatalogStats>("/stats", { cookie });
}

// ---------------------------------------------------------------------------
// Moderation
// ---------------------------------------------------------------------------

export function getModerationQueueCount(cookie?: string): Promise<{ count: number }> {
  return apiFetch<{ count: number }>("/mod/queue/count", { cookie });
}
