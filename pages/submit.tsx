import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState, useCallback, useRef } from "react";
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
    sublabel: (s.type ?? "").replace(/_/g, " "),
  }));
}

// ---------------------------------------------------------------------------
// Cover upload
// ---------------------------------------------------------------------------

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

interface CoverUploadProps {
  entityType: "anime" | "singer";
  aspect?: "poster" | "square"; // poster = 2:3, square = 1:1
  onUploaded: (objectKey: string, previewUrl: string) => void;
}

function CoverUpload({ entityType, aspect = "poster", onUploaded }: CoverUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadErr("JPEG, PNG, or WebP only");
      return;
    }
    setUploading(true);
    setUploadErr(null);
    const localUrl = URL.createObjectURL(file);
    setPreview(localUrl);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch(`/api/uploads/cover?entity_type=${entityType}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Upload failed (${res.status})`);
      }
      const { object_key, public_url } = await res.json();
      onUploaded(object_key, public_url || localUrl);
    } catch (err) {
      setUploadErr(err instanceof Error ? err.message : "Upload failed");
      setPreview(null);
      URL.revokeObjectURL(localUrl);
    } finally {
      setUploading(false);
    }
  }, [entityType, onUploaded]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div className={`cover-upload ${aspect}`}>
      <div
        className={`cover-zone${preview ? " has-preview" : ""}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Cover preview" className="cover-preview-img" />
        ) : (
          <div className="cover-ph">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <path d="m21 15-5-5L5 21"/>
            </svg>
            <span>{uploading ? "Uploading…" : "Click or drop image"}</span>
            <span className="cover-ph-sub">JPEG · PNG · WebP</span>
          </div>
        )}
      </div>
      {!preview && (
        <button type="button" className="btn sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Choose file"}
        </button>
      )}
      {preview && (
        <button type="button" className="btn sm ghost" onClick={() => { setPreview(null); onUploaded("", ""); }}>
          Remove
        </button>
      )}
      {uploadErr && <span className="ferr">{uploadErr}</span>}
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={handleChange} />
    </div>
  );
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
  const [notes, setNotes] = useState("");
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
        notes_for_moderator: notes.trim(),
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

  const TYPE_OPTIONS = [
    { value: "opening" as TrackKind, tag: "OP", cls: "op", name: "Opening", desc: "Intro sequence · ~90 sec · plays at the start of every episode" },
    { value: "ending"  as TrackKind, tag: "ED", cls: "ed", name: "Ending",  desc: "Outro sequence · ~90 sec · plays at the end of every episode" },
    { value: "ost"     as TrackKind, tag: "OST", cls: "ost", name: "OST / insert", desc: "Score, insert song, or character song · any length" },
  ];

  const titleLabel = kind === "ost" ? "Track title" : kind === "ending" ? "Ending title" : "Opening title";

  return (
    <form onSubmit={handleSubmit}>
      <div className="sub-form-card">
        <div className="sub-form-head">
          <h2>Submit an <em>{kind === "ost" ? "OST" : kind}</em>.</h2>
          <p>OP, ED, or OST · We&apos;ll attach it to its anime + singer</p>
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
                <div className="tp-desc">{opt.desc}</div>
              </button>
            ))}
          </div>

          <div className="sub-section"><span className="sub-step">02</span> Source video</div>
          <div className="sub-row">
            <label>YouTube link <span className="req">*</span></label>
            <input type="url" value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=…" />
            <span className="hint">Official upload preferred — Crunchyroll, the studio, the artist&apos;s channel.</span>
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

          <div className="sub-section"><span className="sub-step">04</span> Anything else?</div>
          <div className="sub-row">
            <label>Notes for moderator <span className="opt">(optional)</span></label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Sources, alternate titles, why this video over another upload…" />
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
    title_romaji: "", title_english: "", title_native: "",
    year: "", format: "tv" as AnimeFormat, episodes: "",
    studio: "", reference_url: "", notes_for_moderator: "",
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
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/anime", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, year: Number(f.year) || 0, episodes: f.episodes ? Number(f.episodes) : undefined, cover_image_key: coverKey }),
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
          <button type="button" className="btn" onClick={() => { setSuccess(false); setF({ title_romaji: "", title_english: "", title_native: "", year: "", format: "tv", episodes: "", studio: "", reference_url: "", notes_for_moderator: "" }); }}>
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
          <p>So OPs, EDs, and OSTs can be attached to a real series</p>
        </div>
        <div className="sub-form-body">

          <div className="sub-section"><span className="sub-step">01</span> Cover image <span className="opt">(optional)</span></div>
          <CoverUpload
            entityType="anime"
            aspect="poster"
            onUploaded={(key) => setCoverKey(key)}
          />

          <div className="sub-section"><span className="sub-step">02</span> Titles</div>
          <div className="sub-row">
            <label>English title <span className="req">*</span></label>
            <input type="text" value={f.title_english} onChange={set("title_english")} placeholder="Attack on Titan" />
            {fieldErrors.title_english && <span className="ferr">{fieldErrors.title_english}</span>}
          </div>
          <div className="sub-grid-2">
            <div className="sub-row">
              <label>Romaji title <span className="opt">(optional)</span></label>
              <input type="text" value={f.title_romaji} onChange={set("title_romaji")} placeholder="Shingeki no Kyojin" />
              <span className="hint">Latin-script transliteration, if different from English.</span>
            </div>
            <div className="sub-row">
              <label>Native (日本語) <span className="opt">(optional)</span></label>
              <input type="text" value={f.title_native} onChange={set("title_native")} placeholder="進撃の巨人" />
            </div>
          </div>

          <div className="sub-section"><span className="sub-step">03</span> Production</div>
          <div className="sub-grid-3">
            <div className="sub-row">
              <label>Year <span className="req">*</span></label>
              <input type="text" inputMode="numeric" value={f.year} onChange={set("year")} placeholder="2013" />
              {fieldErrors.year && <span className="ferr">{fieldErrors.year}</span>}
            </div>
            <div className="sub-row">
              <label>Format</label>
              <select value={f.format} onChange={set("format")}>
                {FORMATS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
            <div className="sub-row">
              <label>Episodes <span className="opt">(optional)</span></label>
              <input type="text" inputMode="numeric" value={f.episodes} onChange={set("episodes")} placeholder="25" />
            </div>
          </div>
          <div className="sub-row">
            <label>Studio <span className="opt">(optional)</span></label>
            <input type="text" value={f.studio} onChange={set("studio")} placeholder="Wit Studio · MAPPA" />
          </div>

          <div className="sub-section"><span className="sub-step">04</span> Verification</div>
          <div className="sub-row">
            <label>Reference link <span className="req">*</span></label>
            <input type="url" value={f.reference_url} onChange={set("reference_url")} placeholder="https://anilist.co/anime/… or MyAnimeList / official site" />
            <span className="hint">Helps the moderator verify the entry. AniList preferred.</span>
            {fieldErrors.reference_url && <span className="ferr">{fieldErrors.reference_url}</span>}
          </div>
          <div className="sub-row">
            <label>Notes for moderator <span className="opt">(optional)</span></label>
            <textarea value={f.notes_for_moderator} onChange={set("notes_for_moderator")} rows={3} placeholder="Sequel/prequel relationships, alternate titles…" />
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
    name: "", name_native: "", type: "solo" as SingerType,
    active_since: "", bio: "", reference_url: "", notes_for_moderator: "",
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
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const res = await fetch("/api/singers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, active_since: f.active_since ? Number(f.active_since) : undefined, cover_image_key: coverKey }),
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
          <button type="button" className="btn" onClick={() => { setSuccess(false); setF({ name: "", name_native: "", type: "solo", active_since: "", bio: "", reference_url: "", notes_for_moderator: "" }); }}>
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
          <p>Solo artist, band, group, or producer whose work appears in anime</p>
        </div>
        <div className="sub-form-body">

          <div className="sub-section"><span className="sub-step">01</span> Photo <span className="opt">(optional)</span></div>
          <CoverUpload
            entityType="singer"
            aspect="square"
            onUploaded={(key) => setCoverKey(key)}
          />

          <div className="sub-section"><span className="sub-step">02</span> Identity</div>
          <div className="sub-row">
            <label>Name <span className="req">*</span></label>
            <input type="text" value={f.name} onChange={set("name")} placeholder="YOASOBI" />
            <span className="hint">Romaji or English — whichever is the canonical form.</span>
            {fieldErrors.name && <span className="ferr">{fieldErrors.name}</span>}
          </div>
          <div className="sub-row">
            <label>Native (日本語) <span className="opt">(optional)</span></label>
            <input type="text" value={f.name_native} onChange={set("name_native")} placeholder="ヨアソビ" />
          </div>

          <div className="sub-section"><span className="sub-step">03</span> About</div>
          <div className="sub-grid-2">
            <div className="sub-row">
              <label>Type <span className="req">*</span></label>
              <select value={f.type} onChange={set("type")}>
                {TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
              {fieldErrors.type && <span className="ferr">{fieldErrors.type}</span>}
            </div>
            <div className="sub-row">
              <label>Active since <span className="opt">(optional)</span></label>
              <input type="text" inputMode="numeric" value={f.active_since} onChange={set("active_since")} placeholder="2019" />
            </div>
          </div>
          <div className="sub-row">
            <label>Short bio <span className="opt">(optional)</span></label>
            <textarea value={f.bio} onChange={set("bio")} rows={3} placeholder="One or two sentences. Genres, notable works, anything that helps recognize them." />
          </div>

          <div className="sub-section"><span className="sub-step">04</span> Verification</div>
          <div className="sub-row">
            <label>Reference link <span className="req">*</span></label>
            <input type="url" value={f.reference_url} onChange={set("reference_url")} placeholder="Official site, Spotify, Wikipedia…" />
            {fieldErrors.reference_url && <span className="ferr">{fieldErrors.reference_url}</span>}
          </div>
          <div className="sub-row">
            <label>Notes for moderator <span className="opt">(optional)</span></label>
            <textarea value={f.notes_for_moderator} onChange={set("notes_for_moderator")} rows={3} placeholder="Anything that helps the reviewer" />
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

const TABS: { id: Tab; icon: React.ReactNode; label: string; sub: string }[] = [
  {
    id: "opening",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 8-6 4 6 4V8Z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>,
    label: "An opening",
    sub: "OP, ED, or OST · 30 sec",
  },
  {
    id: "anime",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>,
    label: "An anime",
    sub: "New series · for OPs to attach to",
  },
  {
    id: "singer",
    icon: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>,
    label: "A singer",
    sub: "Solo, band, or group · vocaloid",
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
              <span className="st-sub">{t.sub}</span>
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
