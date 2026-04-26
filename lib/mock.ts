// In-memory fixtures used while the Go API is not yet wired up. The shapes
// match lib/types.ts so swapping over to real API calls is mechanical:
// just delete the .catch fallbacks in pages/index.tsx that point here.

import type { Group, Opening, OpeningPage, User } from "./types";

const titles = [
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

const scores: Array<[number, number]> = [
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

const patterns: Array<1 | 2 | 3 | 4 | 5 | 6> = [1, 2, 3, 4, 5, 6, 2, 4, 1];
const newAt: Array<string | null> = ["2d", null, null, null, "5d", null, null, "6d", null];

export function mockOpenings(): OpeningPage {
  const items: Opening[] = titles.map((title, i) => ({
    id: `op_${i + 1}`,
    title,
    youtube_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    anime: { id: `a_${i + 1}`, name: "[ anime ]" },
    singer: { id: `s_${i + 1}`, name: "[ singer ]" },
    status: "approved",
    submitted_by_user_id: "u_1",
    submitted_at: new Date().toISOString(),
    avg_rating: scores[i][0],
    rating_count: scores[i][1],
    is_new: newAt[i] !== null,
    pattern: patterns[i],
    duration: ["1:30", "1:29", "1:31", "1:28", "1:30", "1:32", "1:30", "1:29", "1:30"][i],
  }));
  return { items, total: 2418, page: 1, per_page: 9 };
}

export function mockMe(): User {
  return {
    id: "u_1",
    email: "insaf@example.com",
    display_name: "@insaf",
    role: "user",
    created_at: new Date().toISOString(),
  };
}

export function mockGroups(): Group[] {
  return [
    { id: "g_rated", owner_user_id: "u_1", name: "Rated",            description: "", is_public: false, is_system_rated: true,  opening_count: 124 },
    { id: "g_1",     owner_user_id: "u_1", name: "Piano openings",   description: "", is_public: true,  share_slug: "piano",  is_system_rated: false, opening_count: 41  },
    { id: "g_2",     owner_user_id: "u_1", name: "J-Rock underrated",description: "", is_public: true,  share_slug: "jrock",  is_system_rated: false, opening_count: 53  },
    { id: "g_3",     owner_user_id: "u_1", name: "Late night rewatch", description: "", is_public: false, is_system_rated: false, opening_count: 18 },
    { id: "g_4",     owner_user_id: "u_1", name: "Studio deep cuts",   description: "", is_public: false, is_system_rated: false, opening_count: 32 },
  ];
}

export function mockStats() {
  return { openings: 2418, anime: 412, singers: 287 };
}
