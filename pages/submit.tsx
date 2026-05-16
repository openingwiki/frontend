import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useState, useCallback, useRef, useEffect } from "react";
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
  return items.map((a: any) => {
    // sublabel: English title (when present) followed by year / format.
    // The English line lets a user confirm they picked the right anime
    // even when they're searching in English while the row is keyed
    // on romaji.
    const tail = a.year ? `${a.year} · ${(a.format ?? "").toUpperCase().replace("_", " ")}` : "";
    const english = (a.title_english ?? "").trim();
    const sublabel = english
      ? (tail ? `${english} · ${tail}` : english)
      : (tail || undefined);
    return {
      id: a.id,
      label: a.name,
      coverUrl: a.cover_image_url ?? null,
      iconShape: "square" as const,
      sublabel,
    };
  });
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
      <>Title is the song name only (romaji or English) — the OP/ED number goes in the separate sequence-number field.</>,
      <>If the anime or singer isn&apos;t in the database yet, submit it first from the other tabs.</>,
    ],
    anime: [
      <>Use the <strong>AniList link</strong> as the reference — it&apos;s the easiest for mods to verify.</>,
      <>Romaji title is required — it&apos;s the canonical key, spell it consistently with AniList.</>,
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
  // sequenceNumber is the OP/ED number. Required when kind is
  // "opening" or "ending" (CHECK constraint added in migration
  // 000014 forbids NULLs for non-OST). Hidden when kind is "ost" —
  // OSTs deliberately don't carry a sequence number. Kept as a
  // string in the input state so the field can be cleared, parsed to
  // a number on submit.
  const [sequenceNumber, setSequenceNumber] = useState<string>("");
  const [selectedAnime, setSelectedAnime] = useState<AutocompleteItem | null>(null);
  const [selectedSinger, setSelectedSinger] = useState<AutocompleteItem | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Clear the sequence field when switching to OST so a leftover value
  // doesn't get sent to the API (the backend rejects sequence_number
  // on OST submissions).
  const setKindClamped = (next: TrackKind) => {
    setKind(next);
    if (next === "ost") setSequenceNumber("");
  };

  const fetchAnime = useCallback(fetchAnimeItems, []);
  const fetchSinger = useCallback(fetchSingerItems, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required";
    if (!youtubeUrl.trim()) errs.youtube_url = "YouTube URL is required";
    if (!selectedAnime) errs.anime_id = "Select an anime";
    if (!selectedSinger) errs.singer_id = "Select a singer";
    // Sequence-number client-side guard. The backend re-validates the
    // same rule, so this is just for snappier feedback — server-side
    // errors still flow through `setFieldErrors(err.fields)` below.
    let parsedSeq: number | null = null;
    if (kind !== "ost") {
      const trimmed = sequenceNumber.trim();
      const n = parseInt(trimmed, 10);
      if (!trimmed || Number.isNaN(n) || n < 1) {
        errs.sequence_number = "Sequence number is required (e.g. 1 for OP1)";
      } else {
        parsedSeq = n;
      }
    }
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
        // null for OST — the backend rejects a non-null sequence
        // number when kind is ost, by design.
        sequence_number: parsedSeq,
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
                onClick={() => setKindClamped(opt.value)}
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
          {kind !== "ost" && (
            <div className="sub-row">
              <label>
                Sequence number <span className="req">*</span>
                <span className="sub-hint"> ({kind === "ending" ? "ED1, ED2…" : "OP1, OP2…"})</span>
              </label>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={sequenceNumber}
                onChange={(e) => setSequenceNumber(e.target.value)}
                placeholder="1"
              />
              {fieldErrors.sequence_number && <span className="ferr">{fieldErrors.sequence_number}</span>}
            </div>
          )}

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
// Shared import-search types
// ---------------------------------------------------------------------------

interface AnilistResult {
  id: string;
  title_romaji: string;
  title_english: string;
  title_native: string;
  year: number | null;
  format: AnimeFormat;
  episodes: number | null;
  studio: string;
  cover_url: string | null;
  reference_url: string;
}

interface SpotifyResult {
  id: string;
  name: string;
  cover_url: string | null;
  reference_url: string;
  genres: string[];
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

  const FORMAT_LABELS: Record<AnimeFormat, string> = {
    tv: "TV", film: "Film", ova_ona: "OVA/ONA", special: "Special",
  };

  const [f, setF] = useState({
    title_romaji: "",
    title_english: "",
    year: "", format: "tv" as AnimeFormat,
    reference_url: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const [coverKey, setCoverKey] = useState("");
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverImporting, setCoverImporting] = useState(false);
  const [coverImportErr, setCoverImportErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // AniList import search
  const [importQuery, setImportQuery] = useState("");
  const [importResults, setImportResults] = useState<AnilistResult[]>([]);
  const [importSearching, setImportSearching] = useState(false);
  const importTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importWrapRef = useRef<HTMLDivElement>(null);

  const handleImportSearch = (q: string) => {
    setImportQuery(q);
    if (importTimer.current) clearTimeout(importTimer.current);
    if (!q.trim()) { setImportResults([]); return; }
    importTimer.current = setTimeout(async () => {
      setImportSearching(true);
      try {
        const res = await fetch(`/api/anilist/search?q=${encodeURIComponent(q)}`);
        const payload = await res.json();
        setImportResults(payload.data ?? []);
      } catch {
        setImportResults([]);
      } finally {
        setImportSearching(false);
      }
    }, 300);
  };

  const handleImportPick = async (item: AnilistResult) => {
    setImportQuery("");
    setImportResults([]);
    setF({
      title_romaji: item.title_romaji,
      title_english: item.title_english,
      year: item.year ? String(item.year) : "",
      format: item.format,
      reference_url: item.reference_url,
    });
    if (item.cover_url) {
      setCoverImporting(true);
      setCoverImportErr(null);
      try {
        const res = await fetch("/api/uploads/cover-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.cover_url, entity_type: "anime" }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Cover import failed");
        const { object_key, public_url } = await res.json();
        setCoverKey(object_key);
        setCoverPreviewUrl(public_url);
      } catch (err) {
        setCoverImportErr(err instanceof Error ? err.message : "Cover import failed");
      } finally {
        setCoverImporting(false);
      }
    }
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (importWrapRef.current && !importWrapRef.current.contains(e.target as Node)) {
        setImportResults([]);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!coverKey) errs.cover_image_key = "Cover image is required";
    if (!f.title_romaji.trim()) errs.title_romaji = "Romaji title is required";
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
          <button type="button" className="btn" onClick={() => { setSuccess(false); setF({ title_romaji: "", title_english: "", year: "", format: "tv", reference_url: "" }); setCoverKey(""); setCoverPreviewUrl(null); }}>
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

          <div className="import-bar" ref={importWrapRef}>
            <div className="import-bar-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm-1-5h2v2h-2zm0-8h2v6h-2z"/></svg>
              Quick import from AniList
            </div>
            <div className="import-input-wrap">
              <input
                type="text"
                value={importQuery}
                onChange={(e) => handleImportSearch(e.target.value)}
                placeholder="Search anime name…"
                autoComplete="off"
              />
              {importSearching && <span className="import-spin">↻</span>}
            </div>
            {importResults.length > 0 && (
              <div className="import-results">
                {importResults.map((item) => (
                  <div
                    key={item.id}
                    className="auto-row"
                    onMouseDown={() => handleImportPick(item)}
                  >
                    <div className="ic">
                      {item.cover_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.cover_url} alt="" />
                      )}
                    </div>
                    <div>
                      <div className="a-name">{item.title_english || item.title_romaji}</div>
                      <div className="a-sub">
                        {[item.year, FORMAT_LABELS[item.format]].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coverImporting && (
              <div className="import-cover-status">Importing cover…</div>
            )}
            {coverImportErr && (
              <div className="import-cover-status" style={{ color: "var(--danger)" }}>{coverImportErr}</div>
            )}
          </div>

          <div className="sub-section"><span className="sub-step">01</span> Cover image <span className="req">*</span></div>
          <CoverUpload
            key={coverPreviewUrl ?? "empty"}
            entityType="anime"
            aspect="poster"
            initialPreviewUrl={coverPreviewUrl}
            onUploaded={(key, url) => { setCoverKey(key); setCoverPreviewUrl(url || null); }}
          />
          {fieldErrors.cover_image_key && <span className="ferr">{fieldErrors.cover_image_key}</span>}

          <div className="sub-section"><span className="sub-step">02</span> Title</div>
          <div className="sub-row">
            <label>Romaji title <span className="req">*</span></label>
            <input type="text" value={f.title_romaji} onChange={set("title_romaji")} placeholder="Shingeki no Kyojin" />
            <span className="hint">Canonical key — required. Picker matches both romaji and English.</span>
            {fieldErrors.title_romaji && <span className="ferr">{fieldErrors.title_romaji}</span>}
          </div>
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
  const [f, setF] = useState({
    name: "", type: "other" as SingerType,
    reference_url: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const [coverKey, setCoverKey] = useState("");
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [coverImporting, setCoverImporting] = useState(false);
  const [coverImportErr, setCoverImportErr] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [success, setSuccess] = useState(false);

  // Spotify import search
  const [importQuery, setImportQuery] = useState("");
  const [importResults, setImportResults] = useState<SpotifyResult[]>([]);
  const [importSearching, setImportSearching] = useState(false);
  const importTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importWrapRef = useRef<HTMLDivElement>(null);

  const handleImportSearch = (q: string) => {
    setImportQuery(q);
    if (importTimer.current) clearTimeout(importTimer.current);
    if (!q.trim()) { setImportResults([]); return; }
    importTimer.current = setTimeout(async () => {
      setImportSearching(true);
      try {
        const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}`);
        const payload = await res.json();
        setImportResults(payload.data ?? []);
      } catch {
        setImportResults([]);
      } finally {
        setImportSearching(false);
      }
    }, 300);
  };

  const handleImportPick = async (item: SpotifyResult) => {
    setImportQuery("");
    setImportResults([]);
    setF((prev) => ({
      ...prev,
      name: item.name,
      reference_url: item.reference_url,
    }));
    if (item.cover_url) {
      setCoverImporting(true);
      setCoverImportErr(null);
      try {
        const res = await fetch("/api/uploads/cover-from-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: item.cover_url, entity_type: "singer" }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Photo import failed");
        const { object_key, public_url } = await res.json();
        setCoverKey(object_key);
        setCoverPreviewUrl(public_url);
      } catch (err) {
        setCoverImportErr(err instanceof Error ? err.message : "Photo import failed");
      } finally {
        setCoverImporting(false);
      }
    }
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (importWrapRef.current && !importWrapRef.current.contains(e.target as Node)) {
        setImportResults([]);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

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
          <button type="button" className="btn" onClick={() => { setSuccess(false); setF({ name: "", type: "other", reference_url: "" }); setCoverKey(""); setCoverPreviewUrl(null); }}>
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

          <div className="import-bar" ref={importWrapRef}>
            <div className="import-bar-label">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>
              Quick import from Spotify
            </div>
            <div className="import-input-wrap">
              <input
                type="text"
                value={importQuery}
                onChange={(e) => handleImportSearch(e.target.value)}
                placeholder="Search artist name…"
                autoComplete="off"
              />
              {importSearching && <span className="import-spin">↻</span>}
            </div>
            {importResults.length > 0 && (
              <div className="import-results">
                {importResults.map((item) => (
                  <div
                    key={item.id}
                    className="auto-row"
                    onMouseDown={() => handleImportPick(item)}
                  >
                    <div className="ic circle">
                      {item.cover_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.cover_url} alt="" />
                      )}
                    </div>
                    <div>
                      <div className="a-name">{item.name}</div>
                      {item.genres.length > 0 && (
                        <div className="a-sub">{item.genres.slice(0, 2).join(", ")}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coverImporting && (
              <div className="import-cover-status">Importing photo…</div>
            )}
            {coverImportErr && (
              <div className="import-cover-status" style={{ color: "var(--danger)" }}>{coverImportErr}</div>
            )}
          </div>

          <div className="sub-section"><span className="sub-step">01</span> Photo <span className="req">*</span></div>
          <CoverUpload
            key={coverPreviewUrl ?? "empty"}
            entityType="singer"
            aspect="square"
            initialPreviewUrl={coverPreviewUrl}
            onUploaded={(key, url) => { setCoverKey(key); setCoverPreviewUrl(url || null); }}
          />
          {fieldErrors.cover_image_key && <span className="ferr">{fieldErrors.cover_image_key}</span>}

          <div className="sub-section"><span className="sub-step">02</span> Identity</div>
          <div className="sub-row">
            <label>Name <span className="req">*</span></label>
            <input type="text" value={f.name} onChange={set("name")} placeholder="YOASOBI" />
            <span className="hint">Romaji or English — whichever is the canonical form.</span>
            {fieldErrors.name && <span className="ferr">{fieldErrors.name}</span>}
          </div>

          <div className="sub-section"><span className="sub-step">03</span> Verification</div>
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
