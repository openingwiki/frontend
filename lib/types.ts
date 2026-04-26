// Domain types — mirror the Go API contract from REQUIREMENTS.md §2.

export type Role = "user" | "moderator" | "admin";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface Anime {
  id: string;
  name: string;
  cover_image_key: string | null;
  status: SubmissionStatus;
  created_by_user_id: string;
}

export interface Singer {
  id: string;
  name: string;
  cover_image_key: string | null;
  status: SubmissionStatus;
}

export interface Opening {
  id: string;
  title: string;
  youtube_url: string;
  anime: Pick<Anime, "id" | "name">;
  singer: Pick<Singer, "id" | "name">;
  status: SubmissionStatus;
  submitted_by_user_id: string;
  submitted_at: string;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  avg_rating: number;
  rating_count: number;
  // UI-only — derived from submitted_at on the server, used by the "NEW" badge.
  is_new?: boolean;
  // UI-only — placeholder until we render real YouTube thumbnails.
  pattern?: 1 | 2 | 3 | 4 | 5 | 6;
  // Optional duration shown over the thumbnail (e.g. "1:30").
  duration?: string;
}

export interface OpeningPage {
  items: Opening[];
  total: number;
  page: number;
  per_page: number;
}

export interface Group {
  id: string;
  owner_user_id: string;
  name: string;
  description: string;
  is_public: boolean;
  share_slug?: string | null;
  is_system_rated: boolean;
  opening_count: number;
}

export type SortKey = "newest" | "top" | "most_rated";
