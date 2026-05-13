import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState, useCallback } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import Autocomplete, { type AutocompleteItem } from "@/components/Autocomplete";
import CoverUpload from "@/components/CoverUpload";
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

// ---------------------------------------------------------------------------
// Fetch helpers (called client-side)
// ---------------------------------------------------------------------------

async function fetchAnimeItems(q: string): Promise<AutocompleteItem[]> {
  const res = await fetch(`/api/anime/search?q=${encodeURIComponent(q)}`);
  if (!res.ok) return [];
  const payload = await res.json();
  const items = Array.isArray(payload.data) ? payload.data : [];
  return items.map((a: any) => ({
    id: a.id,
    label: a.name,
    coverUrl: a.cover_image_url ?? null,
    iconShape: "square" as const,
    sublabel: a.year ? `${a.year} · ${(a.format ?? "").toUpperCase().replace("_", " ")}` : undefined,
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
    coverUrl: s.cover_image_url ?? null,
    iconShape: "circle" as const,
    sublabel: (s.type ?? "").replace(/_/g, " "),
  }));
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function Sidebar({ tab }: { tab: Tab }) {
  const tips: Record<Tab, React.ReactNode[]> = {
    opening: [
      <><strong>Official upload preferred</strong> — Crunchyroll, the studio, or the artist&apos;s channel.</>,
      <>Title in romaji or English — no season abbreviations (OP1, OP2 etc.).</>,
      <>If the anime or singer isn&apos;t in the database yet, submit it first from the other tabs.</>,
    ],
    anime: [
      <>Use the <strong>AniList link</strong> as the reference — it&apos;s the easiest for mods to verify.</>,
      <>Romaji title is the canonical key — spell it consistently with AniList.</>,
      <>Sequels and side stories should be separate entries if they have their own OPs.</>,
    ],
    singer: [
      <>Use the canonical name — the one on their official Spotify or Wikipedia page.</>,
      <>Vocaloid producers and composers count — include them if they made the track.</>,
      <>One entry per act; solo albums by a band member get their own singer entry.</>,
    ],
  };

  return (
    <aside className="sub-side">
      <div className="sub-panel">
        <div className="sub-panel-head">What happens next</div>
        <div className="sub-panel-body">
          <div className="sub-timeline">
            <div className="sub-tl-step now">
              <div className="sub-tl-dot">1</div>
              <div className="sub-tl-text">
                <div className="sub-tl-title">You submit</div>
                <div className="sub-tl-sub">Lands in the moderation queue. You can edit until a mod picks it up.</div>
              </div>
            </div>
            <div className="sub-tl-step">
              <div className="sub-tl-dot">2</div>
              <div className="sub-tl-text">
                <div className="sub-tl-title">A mod reviews</div>
                <div className="sub-tl-sub">Checks the source, attribution, and dedup. Usually under 24h.</div>
              </div>
            </div>
            <div className="sub-tl-step">
              <div className="sub-tl-dot">3</div>
              <div className="sub-tl-text">
                <div className="sub-tl-title">It goes live</div>
                <div className="sub-tl-sub">Shows up as the contributor on the entry.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sub-panel">
        <div className="sub-panel-head">Tips</div>
        <div className="sub-panel-body sub-tips">
          <ul>
            {tips[tab].map((tip, i) => <li key={i}>{tip}</li>)}
          </ul>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// Opening form
// ---------------------------------------------------------------------------

function OpeningPane({ onSwitchTab }: { onSwitchTab: (t: Tab) => void }) {
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
      const err = payload.error;
      const message = typeof err === "string"
        ? err
        : (err?.message ?? "Submission failed");
      setError(message);
      if (err?.fields) setFieldErrors(err.fields);
      return;
    }

    router.push(`/?kind=${kind}`);
  };

  const TYPE_OPTIONS = [
    { value: "opening" as TrackKind, tag: "OP", cls: "op", name: "Opening" },
    { value: "ending"  as TrackKind, tag: "ED", cls: "ed", name: "Ending" },
    { value: "ost"     as TrackKind, tag: "OST", cls: "ost", name: "OST / insert" },
  ];

  const titleLabel = kind === "ost" ? "Track title" : kind === "ending" ? "Ending title" : "Opening title";

  return (
    <form onSubmit={handleSubmit}>
      <div className="sub-form-card">
        <div className="sub-form-head">
          <h2>Submit an <em>{kind === "ost" ? "OST" : kind}</em>.</h2>
        </div>
        <div className="sub-form-body">

          <div className="sub-section"><span className="sub-step">01</span> What kind of track?</div>
          <div className="sub-type-grid">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={`sub-type-pick ${opt.cls}${kind === opt.value ? " on" : ""}`}
                onClick={() => setKind(opt.value)}
              >
                <div className="tp-row">
                  <span className="tp-tag">{opt.tag}</span>
                  <span className="tp-radio" />
                </div>
                <div className="tp-name">{opt.name}</div>
              </button>
            ))}
          </div>

          <div className="sub-section"><span className="sub-step">02</span> Source video</div>
          <div className="sub-row">
            <label>YouTube link <span className="req">*</span></label>
            <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
            {fieldErrors.youtube_url && <span className="ferr">{fieldErrors.youtube_url}</span>}
          </div>
          <div className="sub-row">
            <label>{titleLabel} <span className="req">*</span></label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song name (romaji or english) — e.g. Mukanjyo" />
            {fieldErrors.title && <span className="ferr">{fieldErrors.title}</span>}
          </div>

          <div className="sub-section"><span className="sub-step">03</span> Anime &amp; singer</div>
          <div className="sub-grid-2">
            <div className="sub-row">
              <label>Anime <span className="req">*</span></label>
              <Autocomplete
                placeholder="Search existing…"
                fetchItems={fetchAnime}
                selected={selectedAnime}
                onSelect={setSelectedAnime}
                onCreateNew={() => onSwitchTab("anime")}
                createNewLabel="Add new anime…"
              />
              {fieldErrors.anime_id && <span className="ferr">{fieldErrors.anime_id}</span>}
            </div>
            <div className="sub-row">
              <label>Singer <span className="req">*</span></label>
              <Autocomplete
                placeholder="Search existing…"
                fetchItems={fetchSinger}
                selected={selectedSinger}
                onSelect={setSelectedSinger}
                onCreateNew={() => onSwitchTab("singer")}
                createNewLabel="Add new singer…"
              />
              {fieldErrors.singer_id && <span className="ferr">{fieldErrors.singer_id}</span>}
            </div>
          </div>

        </div>
        <div className="sub-form-foot">
          <span className="sub-foot-note">⌘ + Enter to submit</span>
          <div className="sub-foot-actions">
            {error && <span className="ferr">{error}</span>}
            <button type="submit" className="btn primary lg" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for review →"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Anime form
// ---------------------------------------------------------------------------

function AnimePane() {
  const FORMATS: { value: AnimeFormat; label: string }[] = [
    { value: "tv",      label: "TV series" },
    { value: "film",    label: "Film" },
    { value: "ova_ona", label: "OVA / ONA" },
    { value: "special", label: "Special" },
  ];

  const [f, setF] = useState({
    title_english: "",
    year: "", format: "tv" as AnimeFormat,
    reference_url: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const [coverKey, setCoverKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!coverKey) errs.cover_image_key = "Cover image is required";
    if (!f.title_english.trim()) errs.title_english = "English title is required";
    if (!f.year.trim()) errs.year = "Year is required";
    if (!f.reference_url.trim()) errs.reference_url = "Reference link is required";
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/anime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, year: Number(f.year) || 0, cover_image_key: coverKey }),
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
      <div className="sub-form-card">
        <div className="sub-form-body" style={{ textAlign: "center", padding: "48px 26px" }}>
          <p style={{ fontSize: 16, marginBottom: 20 }}>Anime submitted for review ✓</p>
          <p className="hint" style={{ marginBottom: 24 }}>Once a mod approves it, it will appear in the anime picker on the Opening tab.</p>
          <button type="button" className="btn" onClick={() => { setSuccess(false); setF({ title_english: "", year: "", format: "tv", reference_url: "" }); setCoverKey(""); }}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="sub-form-card">
        <div className="sub-form-head">
          <h2>Submit an <em>anime</em>.</h2>
        </div>
        <div className="sub-form-body">

          <div className="sub-section"><span className="sub-step">01</span> Cover image <span className="req">*</span></div>
          <CoverUpload
            entityType="anime"
            aspect="poster"
            onUploaded={(key) => setCoverKey(key)}
          />
          {fieldErrors.cover_image_key && <span className="ferr">{fieldErrors.cover_image_key}</span>}

          <div className="sub-section"><span className="sub-step">02</span> Title</div>
          <div className="sub-row">
            <label>English title <span className="req">*</span></label>
            <input type="text" value={f.title_english} onChange={set("title_english")} placeholder="Attack on Titan" />
            {fieldErrors.title_english && <span className="ferr">{fieldErrors.title_english}</span>}
          </div>

          <div className="sub-section"><span className="sub-step">03</span> Production</div>
          <div className="sub-grid-2">
            <div className="sub-row">
              <label>Year <span className="req">*</span></label>
              <input type="text" inputMode="numeric" value={f.year} onChange={set("year")} placeholder="2013" />
              {fieldErrors.year && <span className="ferr">{fieldErrors.year}</span>}
            </div>
            <div className="sub-row">
              <label>Format <span className="req">*</span></label>
              <select value={f.format} onChange={set("format")}>
                {FORMATS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          <div className="sub-section"><span className="sub-step">04</span> Verification</div>
          <div className="sub-row">
            <label>Reference link <span className="req">*</span></label>
            <input type="url" value={f.reference_url} onChange={set("reference_url")} placeholder="https://anilist.co/anime/… or MyAnimeList / official site" />
            <span className="hint">Helps the moderator verify the entry. AniList preferred.</span>
            {fieldErrors.reference_url && <span className="ferr">{fieldErrors.reference_url}</span>}
          </div>

        </div>
        <div className="sub-form-foot">
          <span className="sub-foot-note">⌘ + Enter to submit</span>
          <div className="sub-foot-actions">
            {error && <span className="ferr">{error}</span>}
            <button type="submit" className="btn primary lg" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for review →"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Singer form
// ---------------------------------------------------------------------------

function SingerPane() {
  const TYPES: { value: SingerType; label: string }[] = [
    { value: "solo",              label: "Solo artist" },
    { value: "band",              label: "Band" },
    { value: "idol_group",        label: "Idol group" },
    { value: "vocaloid_producer", label: "Vocaloid producer" },
    { value: "composer",          label: "Composer" },
    { value: "other",             label: "Other" },
  ];

  const [f, setF] = useState({
    name: "", type: "solo" as SingerType,
    reference_url: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const [coverKey, setCoverKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!coverKey) errs.cover_image_key = "Photo is required";
    if (!f.name.trim()) errs.name = "Name is required";
    if (!f.reference_url.trim()) errs.reference_url = "Reference link is required";
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/singers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, cover_image_key: coverKey }),
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
      <div className="sub-form-card">
        <div className="sub-form-body" style={{ textAlign: "center", padding: "48px 26px" }}>
          <p style={{ fontSize: 16, marginBottom: 20 }}>Singer submitted for review ✓</p>
          <p className="hint" style={{ marginBottom: 24 }}>Once approved, they will appear in the singer picker on the Opening tab.</p>
          <button type="button" className="btn" onClick={() => { setSuccess(false); setF({ name: "", type: "solo", reference_url: "" }); setCoverKey(""); }}>
            Submit another
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="sub-form-card">
        <div className="sub-form-head">
          <h2>Submit a <em>singer</em>.</h2>
        </div>
        <div className="sub-form-body">

          <div className="sub-section"><span className="sub-step">01</span> Photo <span className="req">*</span></div>
          <CoverUpload
            entityType="singer"
            aspect="square"
            onUploaded={(key) => setCoverKey(key)}
          />
          {fieldErrors.cover_image_key && <span className="ferr">{fieldErrors.cover_image_key}</span>}

          <div className="sub-section"><span className="sub-step">02</span> Identity</div>
          <div className="sub-row">
            <label>Name <span className="req">*</span></label>
            <input type="text" value={f.name} onChange={set("name")} placeholder="YOASOBI" />
            <span className="hint">Romaji or English — whichever is the canonical form.</span>
            {fieldErrors.name && <span className="ferr">{fieldErrors.name}</span>}
          </div>

          <div className="sub-section"><span className="sub-step">03</span> About</div>
          <div className="sub-row">
            <label>Type <span className="req">*</span></label>
            <select value={f.type} onChange={set("type")}>
              {TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            {fieldErrors.type && <span className="ferr">{fieldErrors.type}</span>}
          </div>

          <div className="sub-section"><span className="sub-step">04</span> Verification</div>
          <div className="sub-row">
            <label>Reference link <span className="req">*</span></label>
            <input type="url" value={f.reference_url} onChange={set("reference_url")} placeholder="Official site, Spotify, Wikipedia…" />
            {fieldErrors.reference_url && <span className="ferr">{fieldErrors.reference_url}</span>}
          </div>

        </div>
        <div className="sub-form-foot">
          <span className="sub-foot-note">⌘ + Enter to submit</span>
          <div className="sub-foot-actions">
            {error && <span className="ferr">{error}</span>}
            <button type="submit" className="btn primary lg" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit for review →"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const TABS: { id: Tab; icon: React.ReactNode; label: string }[] = [
  {
    id: "opening",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>,
    label: "An opening",
  },
  {
    id: "anime",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>,
    label: "An anime",
  },
  {
    id: "singer",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>,
    label: "A singer",
  },
];

export default function SubmitPage({ user, modQueueCount }: Props) {
  const [tab, setTab] = useState<Tab>("opening");

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Submit · Opening Wiki">
      <div className="wrap">
        <div className="sub-crumb">
          <Link href="/">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
            Back to catalogue
          </Link>
        </div>

        <div className="sub-head">
          <h1>Submit something <em>new</em>.</h1>
          <p>Anyone can propose entries · Mods review within 24h · You&apos;ll get a notification when it&apos;s live</p>
        </div>

        <div className="sub-tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`sub-tab${tab === t.id ? " on" : ""}`}
              onClick={() => setTab(t.id)}
            >
              <span className="st-label">{t.icon}{t.label}</span>
            </button>
          ))}
        </div>

        <div className="sub-page-grid">
          <div>
            {tab === "opening" && <OpeningPane onSwitchTab={setTab} />}
            {tab === "anime"   && <AnimePane />}
            {tab === "singer"  && <SingerPane />}
          </div>
          <Sidebar tab={tab} />
        </div>
      </div>
    </Layout>
  );
}
