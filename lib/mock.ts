// In-memory fixtures used while the Go API is not yet wired up. The shapes
// match lib/types.ts so swapping over to real API calls is mechanical:
// just delete the .catch fallbacks in pages/index.tsx that point here.

import type { AdjacentOpenings, Group, Opening, OpeningPage, RateResponse, User, UserRating } from "./types";

// ---------------------------------------------------------------------------
// Raw fixture data
// ---------------------------------------------------------------------------

const TITLES = [
  "[ opening title #1 ]",
  "[ opening title #2 ]",
  "[ opening title #3 ]",
  "[ opening title #4 ]",
  "[ opening title #5 ]",
  "[ opening title #6 ]",
  "[ opening title #7 ]",
  "[ opening title #8 ]",
  "[ opening title #9 ]",
];

const ANIME_NAMES = [
  "[ anime A ]",
  "[ anime B ]",
  "[ anime C ]",
  "[ anime D ]",
  "[ anime E ]",
  "[ anime F ]",
  "[ anime G ]",
  "[ anime H ]",
  "[ anime I ]",
];

const SINGER_NAMES = [
  "[ singer 1 ]",
  "[ singer 2 ]",
  "[ singer 3 ]",
  "[ singer 4 ]",
  "[ singer 5 ]",
  "[ singer 6 ]",
  "[ singer 7 ]",
  "[ singer 8 ]",
  "[ singer 9 ]",
];

const SCORES: Array<[number, number]> = [
  [9.4, 1204],
  [9.2, 988],
  [9.0, 2104],
  [8.9, 720],
  [8.8, 612],
  [8.7, 503],
  [8.5, 441],
  [8.4, 318],
  [8.3, 267],
];

const PATTERNS: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6, 2, 4, 1];
const IS_NEW = [true, false, false, false, true, false, false, true, false];
const DURATIONS = ["1:30", "1:29", "1:31", "1:28", "1:30", "1:32", "1:30", "1:29", "1:30"];

// Stable past dates so SSR timestamps are deterministic
const SUBMITTED_AT = [
  "2025-04-24T10:00:00Z",
  "2025-04-20T15:30:00Z",
  "2025-04-10T08:00:00Z",
  "2025-03-28T12:00:00Z",
  "2025-04-21T18:00:00Z",
  "2025-03-15T09:00:00Z",
  "2025-03-01T11:00:00Z",
  "2025-04-20T07:00:00Z",
  "2025-02-14T20:00:00Z",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildOpening(i: number): Opening {
  return {
    id: `op_${i + 1}`,
    title: TITLES[i],
    youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    kind: "opening",
    anime: { id: `a_${i + 1}`, name: ANIME_NAMES[i] },
    singer: { id: `s_${i + 1}`, name: SINGER_NAMES[i] },
    status: "approved",
    submitted_by_user_id: "u_1",
    submitted_at: SUBMITTED_AT[i],
    avg_rating: SCORES[i][0],
    rating_count: SCORES[i][1],
    is_new: IS_NEW[i],
    pattern: PATTERNS[i],
    duration: DURATIONS[i],
  };
}

const ALL_OPENINGS: Opening[] = TITLES.map((_, i) => buildOpening(i));

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export function mockOpenings(): OpeningPage {
  return { items: ALL_OPENINGS, total: 2418, page: 1, per_page: 9 };
}

/** Look up a single opening by id. Returns null if not found in fixtures. */
export function mockOpening(id: string): Opening | null {
  return ALL_OPENINGS.find((o) => o.id === id) ?? null;
}

/**
 * Returns the previous and next openings relative to `id` in the mock list.
 * This mirrors what the Go API's GET /openings/:id/adjacent would return.
 */
export function mockAdjacentOpenings(id: string): AdjacentOpenings {
  const idx = ALL_OPENINGS.findIndex((o) => o.id === id);
  if (idx === -1) return { prev: null, next: null };

  const prev = idx > 0 ? ALL_OPENINGS[idx - 1] : null;
  const next = idx < ALL_OPENINGS.length - 1 ? ALL_OPENINGS[idx + 1] : null;

  return {
    prev: prev ? { id: prev.id, title: prev.title, anime: prev.anime } : null,
    next: next ? { id: next.id, title: next.title, anime: next.anime } : null,
  };
}

export function mockMe(): User {
  return {
    id: "u_1",
    email: "insaf@example.com",
    display_name: "@insaf",
    role: "user",
    created_at: "2024-01-01T00:00:00Z",
    email_verified: true,
    avatar_url: null,
  };
}

export function mockGroups(): Group[] {
  return [
    { id: "g_rated", owner_user_id: "u_1", name: "Rated",             description: "", is_public: false, is_system_rated: true,  opening_count: 124 },
    { id: "g_1",     owner_user_id: "u_1", name: "Piano openings",    description: "", is_public: true,  share_slug: "piano",  is_system_rated: false, opening_count: 41  },
    { id: "g_2",     owner_user_id: "u_1", name: "J-Rock underrated", description: "", is_public: true,  share_slug: "jrock",  is_system_rated: false, opening_count: 53  },
    { id: "g_3",     owner_user_id: "u_1", name: "Late night rewatch",description: "", is_public: false, is_system_rated: false, opening_count: 18 },
    { id: "g_4",     owner_user_id: "u_1", name: "Studio deep cuts",  description: "", is_public: false, is_system_rated: false, opening_count: 32 },
  ];
}

export function mockStats() {
  return { openings: 2418, anime: 412, singers: 287 };
}

/**
 * Simulates the server's response after rating an opening.
 * In the real app the server recalculates avg/count.
 */
export function mockRateResponse(score: number, current: Opening): RateResponse {
  // Fake recalculation: pretend user is new rater
  const newCount = current.rating_count + 1;
  const newAvg = (current.avg_rating * current.rating_count + score) / newCount;
  return {
    avg_rating: Math.round(newAvg * 10) / 10,
    rating_count: newCount,
    user_score: score,
  };
}

/** Mock user rating — returned as part of opening detail when authed */
export function mockUserRating(openingId: string): UserRating | null {
  // Simulate: user has already rated the first opening
  if (openingId === "op_1") return { score: 9, rated_at: "2025-04-01T12:00:00Z" };
  return null;
}
