// Solo Endless mode — client-side fetch helpers.
//
// The hub page loads stats + leaderboard through getServerSideProps via
// lib/api.ts. The run page is interactive and drives all calls from
// the browser through the Next API proxy under /api/play/* (so the
// session cookie + CSRF flow matches every other mutating route on the
// site).

import type { Opening, Anime, Singer } from "./types";

export interface SoloRun {
  id: string;
  status: "active" | "ended" | "abandoned";
  score: number;
  lives: number;
  streak: number;
  longest_streak: number;
  started_at: string;
  ended_at: string | null;
}

export interface SoloRound {
  round_id: string;
  round_token: string;
  round_no: number;
  mode: "audio" | "visual" | "lyrics";
  clip_url: string;
  clip_duration_ms: number;
  // server_now_ms is the server's UTC ms at the moment this round payload
  // was rendered. play_at_ms is when the audio is supposed to start;
  // expires_at_ms is the deadline. The client derives both countdowns by
  // subtracting (server_now_ms - performance.now()) from the server
  // anchors — never from a local "I just got this" timestamp — so a
  // page reload picks up exactly where we are in the round.
  server_now_ms: number;
  play_at_ms: number;
  expires_at_ms: number;
}

// The reveal card shape — opening + the catalog data the user already
// sees on the detail page, plus the gameplay-shaped stats (your time,
// avg player time, score delta).
export interface SoloOpening extends Opening {
  anime: Pick<Anime, "id" | "name"> & { title_romaji?: string; year?: number; cover_image_url?: string | null };
  singer: Pick<Singer, "id" | "name">;
}

export interface SoloRoundResult {
  round_id: string;
  correct: boolean;
  correct_opening: SoloOpening | null;
  your_response_ms: number;
  avg_player_response_ms: number;
  score_delta: number;
  score: number;
  streak: number;
  lives: number;
}

export interface SoloModeSummary {
  mode: string;
  hits: number;
  total: number;
  avg_response_ms: number;
}

export interface SoloMissedClip {
  opening_id: string;
  title: string;
  anime_name: string;
  year: number;
  mode: string;
}

export interface SoloRunSummary {
  run_id: string;
  score: number;
  longest_streak: number;
  started_at: string;
  ended_at: string;
  by_mode: SoloModeSummary[];
  missed_clips: SoloMissedClip[];
}

export interface SoloAnswerResponse {
  run: SoloRun;
  round_result: SoloRoundResult;
  next_round?: SoloRound;
  run_summary?: SoloRunSummary;
  // True when the run ended because every opening in the catalog has
  // now been answered. Triggers the "library cleared" celebration
  // screen instead of the regular run-end summary.
  library_cleared?: boolean;
}

export interface SoloStartResponse {
  run: SoloRun;
  round: SoloRound;
}

export interface SoloLeaderboardEntry {
  rank: number;
  user_id: string;
  display_name: string;
  score: number;
  run_id: string;
  ended_at: string;
}

export interface SoloLeaderboard {
  entries: SoloLeaderboardEntry[];
  you?: SoloLeaderboardEntry;
  resets_in_sec: number;
}

export interface SoloMyStats {
  best_score: number;
  longest_streak: number;
  avg_response_ms: number;
  runs_played: number;
  todays_best: number;
  todays_rank: number;
  on_leaderboard: boolean;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/play${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    // Surface the backend's error.code so the run UI can branch on it
    // (e.g. round_token_invalid → soft-recover to GET /runs/{id}).
    const body = await res.json().catch(() => ({}));
    const code = body?.error?.code ?? "request_failed";
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { code, status: res.status });
  }
  const body = await res.json();
  return body.data as T;
}

export const playClient = {
  startRun: () => call<SoloStartResponse>("/solo/runs", { method: "POST" }),
  getRun: (id: string) => call<{ run: SoloRun; current_round?: SoloRound }>(`/solo/runs/${encodeURIComponent(id)}`),
  // Returns null when the caller has no active run (server replies 204
  // No Content). Otherwise resolves to the active run + its current
  // pending round, ready to drop into the mode-reveal / in-match phase.
  currentRun: () => callOptional<{ run: SoloRun; current_round?: SoloRound }>("/solo/me/current"),
  submitAnswer: (id: string, body: { round_token: string; anime_id: string | null; client_response_ms: number }) =>
    call<SoloAnswerResponse>(`/solo/runs/${encodeURIComponent(id)}/answer`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  leaderboard: (date?: string) =>
    call<SoloLeaderboard>(`/solo/leaderboard${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  myStats: () => call<SoloMyStats>("/solo/me/stats"),
};

async function callOptional<T>(path: string): Promise<T | null> {
  const res = await fetch(`/api/play${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = body?.error?.code ?? "request_failed";
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { code, status: res.status });
  }
  const body = await res.json();
  return body.data as T;
}

// Formatting helpers shared between hub and run-end pages.
export function formatResetCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h <= 0) return `${m}m`;
  return `${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
}

export function formatResponseMs(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const s = ms / 1000;
  return s < 10 ? s.toFixed(1) + "s" : Math.round(s) + "s";
}
