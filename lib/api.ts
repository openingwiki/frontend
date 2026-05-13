// Server-side Go API client.
// Used exclusively from getServerSideProps / API routes; never import into
// browser bundles. It forwards the user's session cookie when present.

import type {
  AdjacentOpenings,
  AnimeDetail,
  AnimeFormat,
  Group,
  GroupDetail,
  Opening,
  OpeningPage,
  PublicGroupSummary,
  RatePayload,
  RateResponse,
  SearchResults,
  SingerDetail,
  SingerType,
  SortKey,
  TrackKind,
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

const VALID_KINDS = new Set(["opening", "ending", "ost"]);

function normalizeKind(value: unknown): "opening" | "ending" | "ost" {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (VALID_KINDS.has(lower)) return lower as "opening" | "ending" | "ost";
  }
  return "opening";
}

function normalizeOpening(opening: any): Opening {
  return {
    ...opening,
    kind: normalizeKind(opening.kind),
    status: opening.status ?? "approved",
    submitted_at: opening.submitted_at ?? opening.approved_at ?? new Date(0).toISOString(),
  };
}

function normalizeNestedOpening<T extends { kind?: unknown }>(item: T): T & { kind: "opening" | "ending" | "ost" } {
  return { ...item, kind: normalizeKind(item.kind) };
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
  // 204 No Content (and other empty-body 2xx) — return undefined as T
  // instead of crashing on JSON.parse(""). Callers that don't await a body
  // (DELETE endpoints) tolerate undefined, callers that do still get JSON.
  if (res.status === 204) return undefined as unknown as T;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return undefined as unknown as T;
  const text = await res.text();
  if (text.length === 0) return undefined as unknown as T;
  return JSON.parse(text) as T;
}

async function apiFetchData<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const payload = await apiFetch<ApiDataEnvelope<T> | undefined>(path, opts);
  return (payload ? payload.data : undefined) as T;
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
  kind?: TrackKind;
  page?: number;
  cookie?: string;
}

export function listOpenings(p: ListOpeningsParams = {}): Promise<OpeningPage> {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.sort) qs.set("sort", p.sort);
  if (p.kind) qs.set("kind", p.kind);
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
  return apiFetchData<AnimeDetail>(`/anime/${encodeURIComponent(id)}`, { cookie }).then((d) => ({
    ...d,
    openings: (d.openings ?? []).map(normalizeNestedOpening),
  }));
}

export function getSinger(id: string, cookie?: string): Promise<SingerDetail> {
  return apiFetchData<SingerDetail>(`/singers/${encodeURIComponent(id)}`, { cookie }).then((d) => ({
    ...d,
    openings: (d.openings ?? []).map(normalizeNestedOpening),
  }));
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

// Clears the viewer's rating for an opening — backend returns the fresh
// aggregates so the UI can stay in sync without a follow-up GET. Also
// auto-removes the opening from the user's "Rated" system group server-side.
export function deleteRating(openingId: string, cookie?: string): Promise<RateResponse> {
  return apiFetchData<any>(`/openings/${encodeURIComponent(openingId)}/rating`, {
    method: "DELETE",
    cookie,
  }).then((data) => ({
    avg_rating: data?.avg_rating ?? 0,
    rating_count: data?.rating_count ?? 0,
    // viewer_rating comes back as null/undefined after delete — surface as 0
    // so the popup widget can clean its state.
    user_score: 0,
  }));
}

export function listMyGroups(cookie?: string): Promise<Group[]> {
  return apiFetchData<Group[]>("/me/groups", { cookie });
}

export function listPublicGroups(cookie?: string): Promise<PublicGroupSummary[]> {
  return apiFetchData<PublicGroupSummary[]>("/groups/public", { cookie });
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

// Admin-only soft-delete of an opening. Backend expects an admin session
// (PATCH check inside the handler) and returns 204 No Content.
export interface AdminUpdateOpeningInput {
  title: string;
  youtube_url: string;
  kind: TrackKind;
  anime_id: string;
  singer_id: string;
  notes_for_moderator?: string | null;
}

export function adminUpdateOpening(openingId: string, input: AdminUpdateOpeningInput, cookie?: string): Promise<void> {
  return apiFetchData<void>(`/admin/openings/${encodeURIComponent(openingId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cookie,
  });
}

export interface AdminUpdateAnimeInput {
  title_english: string;
  year: number;
  format: AnimeFormat;
  reference_url: string;
  cover_image_key: string;
}

export function adminUpdateAnime(animeId: string, input: AdminUpdateAnimeInput, cookie?: string): Promise<void> {
  return apiFetchData<void>(`/admin/anime/${encodeURIComponent(animeId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cookie,
  });
}

export interface AdminUpdateSingerInput {
  name: string;
  type: SingerType;
  reference_url: string;
  cover_image_key: string;
}

export function adminUpdateSinger(singerId: string, input: AdminUpdateSingerInput, cookie?: string): Promise<void> {
  return apiFetchData<void>(`/admin/singers/${encodeURIComponent(singerId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    cookie,
  });
}

export function adminDeleteOpening(openingId: string, cookie?: string): Promise<void> {
  return apiFetchData<void>(`/admin/openings/${encodeURIComponent(openingId)}`, {
    method: "DELETE",
    cookie,
  });
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

export interface KindCounts {
  opening: number;
  ending: number;
  ost: number;
}

export function getKindCounts(cookie?: string): Promise<KindCounts> {
  return Promise.all([
    listOpenings({ kind: "opening", page: 1, cookie }),
    listOpenings({ kind: "ending",  page: 1, cookie }),
    listOpenings({ kind: "ost",     page: 1, cookie }),
  ]).then(([op, ed, ost]) => ({
    opening: op.total,
    ending:  ed.total,
    ost:     ost.total,
  }));
}

export function getMySubmissions(cookie?: string): Promise<import("./types").MySubmissionsResponse> {
  return apiFetchData<import("./types").MySubmissionsResponse>("/me/submissions", { cookie });
}

export type ContributorRange = "week" | "all";

export interface ContributorEntry {
  rank: number;
  user_id: string;
  display_name: string;
  count: number;
}

export interface ContributorLeaderboard {
  range: ContributorRange;
  entries: ContributorEntry[];
  you?: ContributorEntry;
}

export function getSubmissionLeaderboard(range: ContributorRange, cookie?: string): Promise<ContributorLeaderboard> {
  return apiFetchData<ContributorLeaderboard>(`/submissions/leaderboard?range=${range}`, { cookie });
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

export interface ListModerationQueueParams {
  type: "opening" | "anime" | "singer";
  page?: number;
  pageSize?: number;
  cookie?: string;
}

export function listModerationQueue(p: ListModerationQueueParams): Promise<{
  items: any[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}> {
  const qs = new URLSearchParams();
  qs.set("type", p.type);
  qs.set("page", String(p.page ?? 1));
  qs.set("page_size", String(p.pageSize ?? 20));
  return apiFetchList<any[]>(`/mod/queue?${qs.toString()}`, { cookie: p.cookie }).then(
    (payload) => ({
      items: payload.data,
      total: payload.meta.total,
      page: payload.meta.page,
      per_page: payload.meta.page_size,
      has_next: payload.meta.has_next,
    }),
  );
}

// ---------------------------------------------------------------------------
// Comments — wired to:
//   GET    /api/v1/openings/{id}/comments?page=&page_size=
//   POST   /api/v1/openings/{id}/comments         (verified email required)
//   PATCH  /api/v1/comments/{id}                  (author only)
//   DELETE /api/v1/comments/{id}                  (author or moderator+)
// ---------------------------------------------------------------------------

export interface ListCommentsParams {
  openingId: string;
  page?: number;
  pageSize?: number;
  cookie?: string;
}

export function listOpeningComments(p: ListCommentsParams): Promise<{
  items: import("./types").OpeningComment[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}> {
  const qs = new URLSearchParams();
  qs.set("page", String(p.page ?? 1));
  qs.set("page_size", String(p.pageSize ?? 50));
  return apiFetchList<import("./types").OpeningComment[]>(
    `/openings/${encodeURIComponent(p.openingId)}/comments?${qs.toString()}`,
    { cookie: p.cookie },
  ).then((payload) => ({
    items: payload.data,
    total: payload.meta.total,
    page: payload.meta.page,
    per_page: payload.meta.page_size,
    has_next: payload.meta.has_next,
  }));
}

export function postOpeningComment(
  openingId: string,
  body: string,
  cookie?: string,
): Promise<import("./types").OpeningComment> {
  return apiFetchData<import("./types").OpeningComment>(
    `/openings/${encodeURIComponent(openingId)}/comments`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
      cookie,
    },
  );
}

export function updateOpeningComment(
  commentId: string,
  body: string,
  cookie?: string,
): Promise<import("./types").OpeningComment> {
  return apiFetchData<import("./types").OpeningComment>(
    `/comments/${encodeURIComponent(commentId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
      cookie,
    },
  );
}

export function deleteOpeningComment(
  commentId: string,
  cookie?: string,
): Promise<void> {
  return apiFetchData<void>(`/comments/${encodeURIComponent(commentId)}`, {
    method: "DELETE",
    cookie,
  });
}

// ---------------------------------------------------------------------------
// Solo Endless — read-only SSR helpers. Mutating calls (start run, submit
// answer) go through the browser-side playClient in lib/play.ts so the
// session cookie + CSRF flow matches the rest of the mutating API.
// ---------------------------------------------------------------------------

import type { SoloLeaderboard, SoloMyStats } from "./play";

export function getSoloLeaderboard(date?: string, cookie?: string): Promise<SoloLeaderboard> {
  const qs = date ? `?date=${encodeURIComponent(date)}` : "";
  return apiFetchData<SoloLeaderboard>(`/play/solo/leaderboard${qs}`, { cookie });
}

export function getSoloMyStats(cookie?: string): Promise<SoloMyStats> {
  return apiFetchData<SoloMyStats>("/play/solo/me/stats", { cookie });
}
