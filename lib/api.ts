// Server-side Go API client.
// Used exclusively from getServerSideProps / API routes; never import into
// browser bundles. It forwards the user's session cookie when present.

import type {
  AdjacentOpenings,
  AnimeDetail,
  Group,
  GroupDetail,
  Opening,
  OpeningPage,
  RatePayload,
  RateResponse,
  SearchResults,
  SingerDetail,
  SortKey,
  User,
  UserRating,
} from "./types";

const API_ORIGIN = process.env.API_BASE_URL || "http://localhost:8080";
const API_PREFIX = "/api/v1";
const CSRF_COOKIE_NAME = "ow_csrf";

// Hard cap on every SSR call to the Go API. Without this a stalled backend
// blocks getServerSideProps for the OS-level TCP timeout (~75s on Linux).
// 2s is enough for a healthy backend over docker network and short enough
// that the .catch() fallback to fixtures kicks in before the user notices.
const API_TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS ?? 2000);

interface FetchOpts extends RequestInit {
  cookie?: string;
}

interface ApiDataEnvelope<T> {
  data: T;
}

interface ApiListEnvelope<T> {
  data: T;
  meta: {
    page: number;
    page_size: number;
    has_next: boolean;
    total: number;
  };
}

function apiUrl(path: string): string {
  return `${API_ORIGIN}${API_PREFIX}${path}`;
}

function getCsrfTokenFromCookieHeader(cookieHeader?: string): string | null {
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === CSRF_COOKIE_NAME) {
      return rest.join("=") || null;
    }
  }

  return null;
}

function normalizeOpening(opening: any): Opening {
  return {
    ...opening,
    status: opening.status ?? "approved",
    submitted_at: opening.submitted_at ?? opening.approved_at ?? new Date(0).toISOString(),
  };
}

async function apiFetch<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(opts.headers as Record<string, string>),
  };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.method && !["GET", "HEAD", "OPTIONS"].includes(opts.method.toUpperCase())) {
    const csrfToken = getCsrfTokenFromCookieHeader(opts.cookie);
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      ...opts,
      headers,
      cache: "no-store",
      signal: opts.signal ?? controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === "AbortError") {
      throw new ApiError(0, `${path} -> timed out after ${API_TIMEOUT_MS}ms`, "");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, `${path} -> ${res.status} ${res.statusText}`, body);
  }
  return (await res.json()) as T;
}

async function apiFetchData<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const payload = await apiFetch<ApiDataEnvelope<T>>(path, opts);
  return payload.data;
}

async function apiFetchList<T>(path: string, opts: FetchOpts = {}): Promise<ApiListEnvelope<T>> {
  return apiFetch<ApiListEnvelope<T>>(path, opts);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public body: string) {
    super(message);
    this.name = "ApiError";
  }
}

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

  return apiFetchList<any[]>(`/openings${query ? `?${query}` : ""}`, { cookie: p.cookie }).then(
    (payload) => ({
      items: payload.data.map(normalizeOpening),
      total: payload.meta.total,
      page: payload.meta.page,
      per_page: payload.meta.page_size,
    }),
  );
}

export function getOpening(id: string, cookie?: string): Promise<Opening> {
  return apiFetchData<any>(`/openings/${encodeURIComponent(id)}`, { cookie }).then(normalizeOpening);
}

export function getAnime(id: string, cookie?: string): Promise<AnimeDetail> {
  return apiFetchData<AnimeDetail>(`/anime/${encodeURIComponent(id)}`, { cookie });
}

export function getSinger(id: string, cookie?: string): Promise<SingerDetail> {
  return apiFetchData<SingerDetail>(`/singers/${encodeURIComponent(id)}`, { cookie });
}

export interface SearchParams {
  q: string;
  types?: Array<"opening" | "anime" | "singer">;
  limit?: number;
  cookie?: string;
}

export function searchAll(params: SearchParams): Promise<SearchResults> {
  const qs = new URLSearchParams();
  qs.set("q", params.q);
  if (params.types && params.types.length > 0) {
    qs.set("types", params.types.join(","));
  }
  if (params.limit) {
    qs.set("limit", String(params.limit));
  }
  return apiFetchData<SearchResults>(`/search?${qs.toString()}`, { cookie: params.cookie });
}

export function getAdjacentOpenings(
  id: string,
  params: { sort?: SortKey; q?: string } = {},
  cookie?: string,
): Promise<AdjacentOpenings> {
  void id;
  void params;
  void cookie;
  return Promise.resolve({ prev: null, next: null });
}

export function getMyRating(id: string, cookie?: string): Promise<UserRating | null> {
  return getOpening(id, cookie).then((opening: any) => {
    if (typeof opening.viewer_rating !== "number") return null;
    return { score: opening.viewer_rating, rated_at: "" };
  });
}

export function rateOpening(payload: RatePayload, cookie?: string): Promise<RateResponse> {
  return apiFetchData<any>(`/openings/${encodeURIComponent(payload.opening_id)}/rating`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ score: payload.score }),
    cookie,
  }).then((data) => ({
    avg_rating: data.avg_rating,
    rating_count: data.rating_count,
    user_score: data.viewer_rating,
  }));
}

export function listMyGroups(cookie?: string): Promise<Group[]> {
  return apiFetchData<Group[]>("/me/groups", { cookie });
}

export function getMyGroup(id: string, cookie?: string): Promise<GroupDetail> {
  return apiFetchData<GroupDetail>(`/me/groups/${encodeURIComponent(id)}`, { cookie });
}

export function getPublicGroup(slug: string, cookie?: string): Promise<GroupDetail> {
  return apiFetchData<GroupDetail>(`/g/${encodeURIComponent(slug)}`, { cookie });
}

export function addOpeningToGroup(
  openingId: string,
  groupId: string,
  cookie?: string,
): Promise<void> {
  return apiFetchData<void>(`/me/groups/${encodeURIComponent(groupId)}/openings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ opening_id: openingId }),
    cookie,
  });
}

export function removeOpeningFromGroup(
  openingId: string,
  groupId: string,
  cookie?: string,
): Promise<void> {
  return apiFetchData<void>(
    `/me/groups/${encodeURIComponent(groupId)}/openings/${encodeURIComponent(openingId)}`,
    { method: "DELETE", cookie },
  );
}

export function getMe(cookie?: string): Promise<User | null> {
  return apiFetchData<{ authenticated: boolean; user: User | null }>("/me", { cookie }).then(
    (data) => (data.authenticated ? data.user : null),
  );
}

export interface CatalogStats {
  openings: number;
  anime: number;
  singers: number;
}

export function getStats(cookie?: string): Promise<CatalogStats> {
  return listOpenings({ page: 1, cookie }).then((page) => ({
    openings: page.total,
    anime: 0,
    singers: 0,
  }));
}

export function getModerationQueueCount(cookie?: string): Promise<{ count: number }> {
  return Promise.all(
    ["opening", "anime", "singer"].map((type) =>
      apiFetchList<any[]>(`/mod/queue?type=${type}&page=1&page_size=1`, { cookie }).then(
        (payload) => payload.meta.total,
      ),
    ),
  ).then((totals) => ({ count: totals.reduce((sum, value) => sum + value, 0) }));
}
