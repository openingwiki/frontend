import type { GetServerSideProps } from "next";
import { useState, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import Autocomplete, { type AutocompleteItem } from "@/components/Autocomplete";
import { loadSession } from "@/lib/session";
import type { TrackKind, AnimeFormat, SingerType, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/submit", permanent: false } };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

type Tab = "opening" | "anime" | "singer";

const KIND_OPTIONS: { value: TrackKind; label: string; sub: string }[] = [
  { value: "opening", label: "Opening", sub: "OP · INTRO" },
  { value: "ending",  label: "Ending",  sub: "ED · OUTRO" },
  { value: "ost",     label: "OST",     sub: "OST · TRACK" },
];

const ANIME_FORMATS: { value: AnimeFormat; label: string }[] = [
  { value: "tv",      label: "TV" },
  { value: "film",    label: "Film" },
  { value: "ova_ona", label: "OVA / ONA" },
  { value: "special", label: "Special" },
];

const SINGER_TYPES: { value: SingerType; label: string }[] = [
  { value: "solo",              label: "Solo artist" },
  { value: "band",              label: "Band" },
  { value: "idol_group",        label: "Idol group" },
  { value: "vocaloid_producer", label: "Vocaloid / producer" },
  { value: "composer",          label: "Composer" },
  { value: "other",             label: "Other" },
];

async function fetchAnimeItems(q: string): Promise<AutocompleteItem[]> {
  const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const payload = await res.json();
  const items = Array.isArray(payload.data) ? payload.data : [];
  return items.map((a: any) => ({
    id: a.id,
    label: a.name,
    sublabel: a.year ? `${a.format?.toUpperCase() ?? ""} · ${a.year}` : undefined,
  }));
}

async function fetchSingerItems(q: string): Promise<AutocompleteItem[]> {
  const res = await fetch(`/api/singers/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const payload = await res.json();
  const items = Array.isArray(payload.data) ? payload.data : [];
  return items.map((s: any) => ({
    id: s.id,
    label: s.name,
    sublabel: s.type?.replace(/_/g, " ") ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// Opening tab
// ---------------------------------------------------------------------------

function OpeningForm() {
  const router = useRouter();
  const [kind, setKind] = useState<TrackKind>("opening");
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [selectedAnime, setSelectedAnime] = useState<AutocompleteItem | null>(null);
  const [selectedSinger, setSelectedSinger] = useState<AutocompleteItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const fetchAnime = useCallback(fetchAnimeItems, []);
  const fetchSinger = useCallback(fetchSingerItems, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    if (!youtubeUrl.trim()) errs.youtube_url = "YouTube URL is required";
    if (!selectedAnime) errs.anime_id = "Select an anime";
    if (!selectedSinger) errs.singer_id = "Select a singer";
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/openings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim(),
        youtube_url: youtubeUrl.trim(),
        kind,
        anime_id: selectedAnime!.id,
        singer_id: selectedSinger!.id,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Submission failed");
      if (payload.fields) setFieldErrors(payload.fields);
      return;
    }

    router.push(`/?kind=${kind}`);
  };

  const titleLabel = kind === "ost" ? "Track title" : kind === "ending" ? "Ending title" : "Opening title";

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label>Type</label>
        <div className="kind-picker">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`kind-btn${kind === opt.value ? " on" : ""}`}
              onClick={() => setKind(opt.value)}
            >
              <span className="kind-btn-label">{opt.label}</span>
              <span className="kind-btn-sub">{opt.sub}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="op-title">{titleLabel}</label>
        <input
          id="op-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={`e.g. Silhouette`}
        />
        {fieldErrors.title && <p className="field-error">{fieldErrors.title}</p>}
      </div>

      <div>
        <label htmlFor="op-yt">YouTube URL</label>
        <input
          id="op-yt"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
        />
        {fieldErrors.youtube_url && <p className="field-error">{fieldErrors.youtube_url}</p>}
      </div>

      <div>
        <label>Anime</label>
        <Autocomplete
          placeholder="Search anime…"
          fetchItems={fetchAnime}
          selected={selectedAnime}
          onSelect={setSelectedAnime}
        />
        {fieldErrors.anime_id && <p className="field-error">{fieldErrors.anime_id}</p>}
        <p className="field-hint">Can&apos;t find it? Submit the anime first from the Anime tab.</p>
      </div>

      <div>
        <label>Singer / Composer</label>
        <Autocomplete
          placeholder="Search singer or composer…"
          fetchItems={fetchSinger}
          selected={selectedSinger}
          onSelect={setSelectedSinger}
        />
        {fieldErrors.singer_id && <p className="field-error">{fieldErrors.singer_id}</p>}
        <p className="field-hint">Can&apos;t find them? Submit the singer first from the Singer tab.</p>
      </div>

      {error && <p className="submit-error">{error}</p>}

      <div className="actions">
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Anime tab
// ---------------------------------------------------------------------------

function AnimeForm() {
  const router = useRouter();
  const [fields, setFields] = useState({
    title_romaji: "", title_english: "", title_native: "",
    year: "", format: "tv" as AnimeFormat,
    episodes: "", studio: "", reference_url: "", notes_for_moderator: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/anime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...fields,
        year: Number(fields.year) || 0,
        episodes: fields.episodes ? Number(fields.episodes) : undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Submission failed");
      if (payload.fields) setFieldErrors(payload.fields);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="submit-success">
        <p>Anime submitted for review. Once approved it will appear in the anime picker.</p>
        <button type="button" className="btn" onClick={() => { setSuccess(false); setFields({ title_romaji: "", title_english: "", title_native: "", year: "", format: "tv", episodes: "", studio: "", reference_url: "", notes_for_moderator: "" }); }}>
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="a-romaji">Romaji title <span className="req">*</span></label>
        <input id="a-romaji" value={fields.title_romaji} onChange={set("title_romaji")} placeholder="e.g. Naruto Shippuden" />
        {fieldErrors.title_romaji && <p className="field-error">{fieldErrors.title_romaji}</p>}
      </div>
      <div>
        <label htmlFor="a-english">English title</label>
        <input id="a-english" value={fields.title_english} onChange={set("title_english")} placeholder="e.g. Naruto: Shippuden" />
      </div>
      <div>
        <label htmlFor="a-native">Native title</label>
        <input id="a-native" value={fields.title_native} onChange={set("title_native")} placeholder="e.g. ナルト 疾風伝" />
      </div>
      <div className="form-row">
        <div>
          <label htmlFor="a-year">Year <span className="req">*</span></label>
          <input id="a-year" type="number" value={fields.year} onChange={set("year")} placeholder="e.g. 2007" min={1900} max={2030} />
          {fieldErrors.year && <p className="field-error">{fieldErrors.year}</p>}
        </div>
        <div>
          <label htmlFor="a-episodes">Episodes</label>
          <input id="a-episodes" type="number" value={fields.episodes} onChange={set("episodes")} placeholder="e.g. 500" min={1} />
        </div>
      </div>
      <div>
        <label>Format <span className="req">*</span></label>
        <div className="kind-picker">
          {ANIME_FORMATS.map((opt) => (
            <button key={opt.value} type="button" className={`kind-btn${fields.format === opt.value ? " on" : ""}`} onClick={() => setFields((f) => ({ ...f, format: opt.value }))}>
              <span className="kind-btn-label">{opt.label}</span>
            </button>
          ))}
        </div>
        {fieldErrors.format && <p className="field-error">{fieldErrors.format}</p>}
      </div>
      <div>
        <label htmlFor="a-studio">Studio</label>
        <input id="a-studio" value={fields.studio} onChange={set("studio")} placeholder="e.g. Studio Pierrot" />
      </div>
      <div>
        <label htmlFor="a-ref">Reference URL <span className="req">*</span></label>
        <input id="a-ref" value={fields.reference_url} onChange={set("reference_url")} placeholder="https://anilist.co/anime/..." />
        {fieldErrors.reference_url && <p className="field-error">{fieldErrors.reference_url}</p>}
      </div>
      <div>
        <label htmlFor="a-notes">Notes for moderator</label>
        <textarea id="a-notes" value={fields.notes_for_moderator} onChange={set("notes_for_moderator")} rows={3} placeholder="Anything that helps the reviewer" />
      </div>
      {error && <p className="submit-error">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Singer tab
// ---------------------------------------------------------------------------

function SingerForm() {
  const [fields, setFields] = useState({
    name: "", name_native: "", type: "solo" as SingerType,
    active_since: "", bio: "", reference_url: "", notes_for_moderator: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/singers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...fields,
        active_since: fields.active_since ? Number(fields.active_since) : undefined,
      }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      setError(payload.error ?? "Submission failed");
      if (payload.fields) setFieldErrors(payload.fields);
      return;
    }

    setSuccess(true);
  };

  if (success) {
    return (
      <div className="submit-success">
        <p>Singer submitted for review. Once approved they will appear in the singer picker.</p>
        <button type="button" className="btn" onClick={() => { setSuccess(false); setFields({ name: "", name_native: "", type: "solo", active_since: "", bio: "", reference_url: "", notes_for_moderator: "" }); }}>
          Submit another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor="s-name">Name <span className="req">*</span></label>
        <input id="s-name" value={fields.name} onChange={set("name")} placeholder="e.g. FLOW" />
        {fieldErrors.name && <p className="field-error">{fieldErrors.name}</p>}
      </div>
      <div>
        <label htmlFor="s-native">Native name</label>
        <input id="s-native" value={fields.name_native} onChange={set("name_native")} placeholder="e.g. フロウ" />
      </div>
      <div>
        <label>Type <span className="req">*</span></label>
        <div className="kind-picker" style={{ flexWrap: "wrap" }}>
          {SINGER_TYPES.map((opt) => (
            <button key={opt.value} type="button" className={`kind-btn${fields.type === opt.value ? " on" : ""}`} onClick={() => setFields((f) => ({ ...f, type: opt.value }))}>
              <span className="kind-btn-label">{opt.label}</span>
            </button>
          ))}
        </div>
        {fieldErrors.type && <p className="field-error">{fieldErrors.type}</p>}
      </div>
      <div>
        <label htmlFor="s-since">Active since (year)</label>
        <input id="s-since" type="number" value={fields.active_since} onChange={set("active_since")} placeholder="e.g. 2003" min={1900} max={2030} />
      </div>
      <div>
        <label htmlFor="s-bio">Bio</label>
        <textarea id="s-bio" value={fields.bio} onChange={set("bio")} rows={3} placeholder="Short description" />
      </div>
      <div>
        <label htmlFor="s-ref">Reference URL <span className="req">*</span></label>
        <input id="s-ref" value={fields.reference_url} onChange={set("reference_url")} placeholder="https://www.last.fm/music/..." />
        {fieldErrors.reference_url && <p className="field-error">{fieldErrors.reference_url}</p>}
      </div>
      <div>
        <label htmlFor="s-notes">Notes for moderator</label>
        <textarea id="s-notes" value={fields.notes_for_moderator} onChange={set("notes_for_moderator")} rows={3} placeholder="Anything that helps the reviewer" />
      </div>
      {error && <p className="submit-error">{error}</p>}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit for review"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TAB_LABELS: Record<Tab, string> = {
  opening: "Opening / Ending / OST",
  anime: "Anime",
  singer: "Singer",
};

const TAB_TITLES: Record<Tab, string> = {
  opening: "Submit a track",
  anime: "Submit an anime",
  singer: "Submit a singer",
};

export default function SubmitPage({ user, modQueueCount }: Props) {
  const [tab, setTab] = useState<Tab>("opening");

  return (
    <Layout user={user} modQueueCount={modQueueCount} title={TAB_TITLES[tab]}>
      <div className="formpage">
        <h1>{TAB_TITLES[tab]}</h1>
        <p>Goes to the moderation queue. Mods/admins are auto-approved.</p>

        <div className="submit-tabs">
          {(["opening", "anime", "singer"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`submit-tab${tab === t ? " on" : ""}`}
              onClick={() => setTab(t)}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === "opening" && <OpeningForm />}
        {tab === "anime" && <AnimeForm />}
        {tab === "singer" && <SingerForm />}
      </div>
    </Layout>
  );
}
