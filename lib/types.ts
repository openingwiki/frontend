// Domain types — mirror the Go API contract from REQUIREMENTS.md §2.

export type Role = "user" | "moderator" | "admin";

export type SubmissionStatus = "pending" | "approved" | "rejected";

export type AnimeFormat = "tv" | "film" | "ova_ona" | "special";
export type SingerType = "solo" | "band" | "idol_group" | "vocaloid_producer" | "composer" | "other";

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
  email_verified: boolean;
  avatar_url: string | null;
}

export interface Anime {
  id: string;
  name: string;
  title_romaji: string;
  title_english: string | null;
  year: number;
  format: AnimeFormat;
  cover_image_url: string | null;
  is_placeholder: boolean;
  status: SubmissionStatus;
}

export interface Singer {
  id: string;
  name: string;
  type: SingerType;
  cover_image_url: string | null;
  is_placeholder: boolean;
  status: SubmissionStatus;
}

export type TrackKind = "opening" | "ending" | "ost";

export interface AnimeAutocompleteItem {
  id: string;
  name: string;
  title_romaji: string;
  format: AnimeFormat;
  year: number;
}

export interface SingerAutocompleteItem {
  id: string;
  name: string;
  type: SingerType;
}

export interface Opening {
  id: string;
  title: string;
  youtube_url: string;
  kind: TrackKind;
  anime: Pick<Anime, "id" | "name">;
  singer: Pick<Singer, "id" | "name">;
  legacy_anime_name?: string | null;
  legacy_singer_name?: string | null;
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
  // Admin-only, included when viewer is admin.
  notes_for_moderator?: string | null;
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

export interface PublicGroupSummary {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_slug: string | null;
  is_system_rated: boolean;
  opening_count: number;
  updated_at: string;
  owner: {
    id: string;
    display_name: string;
    avatar_url: string | null;
  };
}

export type SortKey = "newest" | "top" | "most_rated";

// Navigation context passed from the list page so the detail page knows which
// openings are adjacent in the current sorted/filtered view.
export interface AdjacentOpening {
  id: string;
  title: string;
  anime: Pick<Anime, "id" | "name">;
}

export interface AdjacentOpenings {
  prev: AdjacentOpening | null;
  next: AdjacentOpening | null;
}

// Rating payload sent to POST /openings/:id/rate
export interface RatePayload {
  opening_id: string;
  score: number; // 1–10
}

// Response from POST /openings/:id/rate
export interface RateResponse {
  avg_rating: number;
  rating_count: number;
  user_score: number;
}

// The user's own rating for an opening (returned by GET /openings/:id when authed)
export interface UserRating {
  score: number;
  rated_at: string;
}

// ---------------------------------------------------------------------------
// Anime / Singer detail pages
// ---------------------------------------------------------------------------

// Trimmed-down opening shape returned in /anime/:id and /singers/:id payloads.
export interface AnimeOpening {
  id: string;
  title: string;
  youtube_url: string;
  kind: TrackKind;
  sequence_number: number | null;
  avg_rating: number;
  rating_count: number;
  approved_at: string | null;
  singer: { id: string; name: string; cover_image_url: string | null };
}

export interface SingerOpening {
  id: string;
  title: string;
  youtube_url: string;
  kind: TrackKind;
  sequence_number: number | null;
  avg_rating: number;
  rating_count: number;
  approved_at: string | null;
  anime: { id: string; name: string; cover_image_url: string | null };
}

export interface AnimeDetail {
  id: string;
  name: string;
  title_romaji: string;
  title_english: string | null;
  title_native: string | null;
  year: number;
  format: AnimeFormat;
  episodes: number | null;
  studio: string | null;
  reference_url: string;
  cover_image_url: string | null;
  openings: AnimeOpening[];
}

export interface SingerDetail {
  id: string;
  name: string;
  name_native: string | null;
  type: SingerType;
  cover_image_url: string | null;
  openings: SingerOpening[];
}

// ---------------------------------------------------------------------------
// Cross-entity search
// ---------------------------------------------------------------------------

export interface SearchOpeningHit {
  id: string;
  title: string;
  anime_name: string;
  singer_name: string;
}

export interface SearchEntityHit {
  id: string;
  name: string;
  cover_image_url: string | null;
}

export interface SearchResults {
  openings: SearchOpeningHit[];
  anime: SearchEntityHit[];
  singers: SearchEntityHit[];
}

// ---------------------------------------------------------------------------
// Group detail (private /me/groups/:id and public /g/:slug)
// ---------------------------------------------------------------------------

export interface GroupOpening {
  id: string;
  title: string;
  youtube_url: string;
  avg_rating: number;
  rating_count: number;
  anime: { id: string; name: string; cover_image_url: string | null };
  singer: { id: string; name: string; cover_image_url: string | null };
}

export interface GroupDetail {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  is_system_rated: boolean;
  share_slug: string | null;
  owner: { id: string; display_name: string; avatar_url?: string | null };
  openings: GroupOpening[];
}

// ---------------------------------------------------------------------------
// Moderation queue
// ---------------------------------------------------------------------------

export type ModerationItemType = "opening" | "anime" | "singer";

export interface ModerationSubmitter {
  id: string;
  display_name: string;
}

export interface ModerationItem {
  id: string;
  type: ModerationItemType;
  status: SubmissionStatus;
  submitted_at: string;
  submitted_by: ModerationSubmitter | null;
  // Set when type === "opening"
  title?: string;
  youtube_url?: string;
  anime_name?: string;
  singer_name?: string;
  // Set when type === "anime" | "singer"
  name?: string;
}

export interface ModerationQueuePage {
  items: ModerationItem[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}

// ---------------------------------------------------------------------------
// Comments (frontend types — backend endpoint TBD; see end of repo notes)
// ---------------------------------------------------------------------------

export interface OpeningComment {
  id: string;
  opening_id: string;
  body: string;
  created_at: string;
  updated_at: string;
  author: {
    id: string;
    display_name: string;
    role: Role;
    avatar_url: string | null;
  };
}

export interface OpeningCommentsPage {
  items: OpeningComment[];
  total: number;
  page: number;
  per_page: number;
  has_next: boolean;
}
