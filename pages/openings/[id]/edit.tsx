import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState, useCallback, useRef, useEffect } from "react";
import Layout from "@/components/Layout";
import { getAnime, getOpening, getSinger } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { pushToast } from "@/lib/toast";
import { youtubeEmbedURL } from "@/lib/youtube";
import type { Opening, TrackKind, User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  opening: Opening;
  embedUrl: string | null;
  animeCoverUrl: string | null;
  singerCoverUrl: string | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || session.user.role !== "admin") {
    return { notFound: true };
  }
  const id = ctx.params?.id as string;
  try {
    const opening = await getOpening(id, session.cookie);
    const [anime, singer] = await Promise.all([
      getAnime(opening.anime.id, session.cookie).catch(() => null),
      getSinger(opening.singer.id, session.cookie).catch(() => null),
    ]);
    return {
      props: {
        user: session.user,
        modQueueCount: session.modQueueCount,
        opening,
        embedUrl: youtubeEmbedURL(opening.youtube_url),
        animeCoverUrl: anime?.cover_image_url ?? null,
        singerCoverUrl: singer?.cover_image_url ?? null,
      },
    };
  } catch {
    return { notFound: true };
  }
};

// ---------------------------------------------------------------------------
// Entity picker (anime / singer search inline dropdown)
// ---------------------------------------------------------------------------

interface EntityItem { id: string; name: string; sublabel?: string; coverUrl?: string | null }

interface RelationPickerProps {
  label: string;
  kind: "anime" | "singer";
  value: EntityItem;
  onChange: (item: EntityItem) => void;
}

function RelationPicker({ label, kind, value, onChange }: RelationPickerProps) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const url = kind === "anime"
        ? `/api/anime/search?q=${encodeURIComponent(q)}`
        : `/api/singers/search?q=${encodeURIComponent(q)}`;
      const res = await fetch(url);
      if (!res.ok) return;
      const payload = await res.json();
      const items: any[] = Array.isArray(payload.data) ? payload.data : [];
      setResults(
        items.map((x) =>
          kind === "anime"
            ? { id: x.id, name: x.name, coverUrl: x.cover_image_url ?? null, sublabel: x.year ? `${x.year} · ${(x.format ?? "").toUpperCase().replace("_", " ")}` : undefined }
            : { id: x.id, name: x.name, coverUrl: x.cover_image_url ?? null, sublabel: (x.type ?? "").replace(/_/g, " ") },
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    const t = setTimeout(() => { if (searching) search(query); }, 250);
    return () => clearTimeout(t);
  }, [query, searching, search]);

  // close on outside click
  useEffect(() => {
    if (!searching) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSearching(false);
        setQuery("");
        setResults([]);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searching]);

  const pick = (item: EntityItem) => {
    onChange(item);
    setSearching(false);
    setQuery("");
    setResults([]);
  };

  const startSearch = () => {
    setSearching(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="edit-row">
      <label className="edit-label">{label} <span className="edit-req">*</span></label>
      <div ref={containerRef} style={{ position: "relative" }}>
        {searching ? (
          <div className="edit-search-wrap">
            <input
              ref={inputRef}
              className="edit-input"
              placeholder={`Search ${kind === "anime" ? "anime" : "singers"}…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearching(false)}
            />
            {(results.length > 0 || loading) && (
              <div className="edit-dropdown">
                {loading && <div className="edit-dropdown-hint">Searching…</div>}
                {results.map((r) => (
                  <button key={r.id} className="edit-dropdown-item" onClick={() => pick(r)}>
                    <span className="edit-dropdown-name">{r.name}</span>
                    {r.sublabel && <span className="edit-dropdown-sub">{r.sublabel}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={`edit-relation${kind === "singer" ? " singer" : ""}`}>
            <div className="edit-relation-ic">
              {value.coverUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={value.coverUrl} alt="" />
              )}
            </div>
            <div>
              <div className="edit-relation-name">{value.name}</div>
              {value.sublabel && <div className="edit-relation-sub">{value.sublabel}</div>}
            </div>
            <button type="button" className="edit-change-btn" onClick={startSearch}>Change…</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const KIND_OPTIONS: { value: TrackKind; tag: string; label: string }[] = [
  { value: "opening", tag: "OP", label: "Opening" },
  { value: "ending",  tag: "ED", label: "Ending" },
  { value: "ost",     tag: "OST", label: "OST / insert" },
];

export default function OpeningEditPage({ user, modQueueCount, opening, embedUrl, animeCoverUrl, singerCoverUrl }: Props) {
  const router = useRouter();

  const [title, setTitle] = useState(opening.title);
  const [youtubeUrl, setYoutubeUrl] = useState(opening.youtube_url);
  const [kind, setKind] = useState<TrackKind>(opening.kind);
  const [anime, setAnime] = useState<EntityItem>({ id: opening.anime.id, name: opening.anime.name, coverUrl: animeCoverUrl });
  const [singer, setSinger] = useState<EntityItem>({ id: opening.singer.id, name: opening.singer.name, coverUrl: singerCoverUrl });
  const [notes, setNotes] = useState(opening.notes_for_moderator ?? "");

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDirty =
    title !== opening.title ||
    youtubeUrl !== opening.youtube_url ||
    kind !== opening.kind ||
    anime.id !== opening.anime.id ||
    singer.id !== opening.singer.id ||
    notes !== (opening.notes_for_moderator ?? "");

  // Esc closes delete confirm
  useEffect(() => {
    if (!confirmDelete) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setConfirmDelete(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [confirmDelete]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/opening-update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: opening.id,
          title: title.trim(),
          youtube_url: youtubeUrl.trim(),
          kind,
          anime_id: anime.id,
          singer_id: singer.id,
          notes_for_moderator: notes || null,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      pushToast({ kind: "success", message: "Opening updated" });
      router.push(`/openings/${opening.id}`);
    } catch (err) {
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "Save failed" });
      setSaving(false);
    }
  };

  const discard = () => {
    router.push(`/openings/${opening.id}`);
  };

  const confirmAndDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/admin/opening-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: opening.id }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      pushToast({ kind: "success", message: "Opening deleted" });
      router.replace("/");
    } catch (err) {
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "Delete failed" });
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const displayName = opening.title;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`Edit · ${displayName} · Opening Wiki`}
    >
      <div className="wrap">

        {/* Breadcrumb */}
        <div className="edit-crumb">
          <Link href="/">Home</Link>
          <span className="edit-crumb-sep">/</span>
          <Link href={`/openings/${opening.id}`}>{opening.title}</Link>
          <span className="edit-crumb-sep">/</span>
          <span className="edit-crumb-here">Edit</span>
        </div>

        {/* Heading */}
        <div className="edit-head">
          <div>
            <div className="edit-eyebrow">
              <span className="edit-admin-badge">Admin · Editing</span>
              <Link href="/mod" className="edit-eyebrow-link">Moderation queue ({modQueueCount})</Link>
            </div>
            <h1 className="edit-h1">Editing <em>{displayName}</em></h1>
            <div className="edit-sub">
              <Link href={`/anime/${opening.anime.id}`}>{opening.anime.name}</Link>
              {" · "}
              <Link href={`/singers/${opening.singer.id}`}>{opening.singer.name}</Link>
              <span style={{ color: "var(--fg-4)" }}> · id: {opening.id}</span>
            </div>
          </div>
          <span style={{ flex: 1 }} />
          <div className="edit-head-actions">
            <Link href={`/openings/${opening.id}`} target="_blank" rel="noreferrer" className="btn">
              ↗ View page
            </Link>
          </div>
        </div>

        <div className="edit-page-grid">
          <main>

            {/* Preview */}
            <div className="edit-card">
              <div className="edit-card-head">
                <span className="edit-card-step">·</span> Preview
                <span style={{ flex: 1 }} />
                <span className="edit-card-meta">Live values</span>
              </div>
              <div className="edit-card-body">
                <div className="edit-preview-strip">
                  <div className="edit-preview-thumb">
                    {embedUrl ? (
                      <iframe
                        src={embedUrl}
                        title={opening.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        frameBorder="0"
                      />
                    ) : (
                      <span className="edit-preview-ph">[ youtube ]</span>
                    )}
                  </div>
                  <div className="edit-preview-info">
                    <div className="edit-pi-row">
                      <div className="edit-pi-cell">
                        <span className="edit-pi-lbl">Title</span>
                        <span className="edit-pi-val">{title || opening.title}</span>
                      </div>
                      <div className="edit-pi-cell">
                        <span className="edit-pi-lbl">Type</span>
                        <span className="edit-pi-val" style={{ textTransform: "capitalize" }}>
                          {kind === "ost" ? "OST" : kind}
                        </span>
                      </div>
                    </div>
                    <div className="edit-pi-row">
                      <div className="edit-pi-cell">
                        <span className="edit-pi-lbl">Anime</span>
                        <span className="edit-pi-val">{anime.name}</span>
                      </div>
                      <div className="edit-pi-cell">
                        <span className="edit-pi-lbl">Singer</span>
                        <span className="edit-pi-val">{singer.name}</span>
                      </div>
                    </div>
                    <div className="edit-pi-row">
                      <div className="edit-pi-cell">
                        <span className="edit-pi-lbl">Score</span>
                        <span className="edit-pi-val">
                          {opening.rating_count > 0
                            ? `${opening.avg_rating.toFixed(1)}/10 · ${opening.rating_count} ratings`
                            : "No ratings yet"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 01 Type */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">01</span> Type</div>
              <div className="edit-card-body">
                <div className="edit-type-row">
                  {KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`edit-type-pick${kind === opt.value ? " on" : ""}`}
                      onClick={() => setKind(opt.value)}
                    >
                      <span className="edit-type-tag">{opt.tag}</span>
                      <span className="edit-type-nm">{opt.label}</span>
                      <span className="edit-type-radio" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 02 Source */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">02</span> Source</div>
              <div className="edit-card-body">
                <div className={`edit-row${youtubeUrl !== opening.youtube_url ? " dirty" : ""}`}>
                  <label className="edit-label">
                    YouTube URL <span className="edit-req">*</span>
                    {youtubeUrl !== opening.youtube_url && <span className="edit-changed">unsaved</span>}
                  </label>
                  <input
                    type="url"
                    className="edit-input"
                    value={youtubeUrl}
                    onChange={(e) => setYoutubeUrl(e.target.value)}
                  />
                  <span className="edit-hint">Official upload preferred.</span>
                </div>
                <div className={`edit-row${title !== opening.title ? " dirty" : ""}`}>
                  <label className="edit-label">
                    Title <span className="edit-req">*</span>
                    {title !== opening.title && <span className="edit-changed">unsaved</span>}
                  </label>
                  <input
                    type="text"
                    className="edit-input"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* 03 Attribution */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">03</span> Attribution</div>
              <div className="edit-card-body edit-attr-grid">
                <RelationPicker
                  label="Anime"
                  kind="anime"
                  value={anime}
                  onChange={setAnime}
                />
                <RelationPicker
                  label="Singer"
                  kind="singer"
                  value={singer}
                  onChange={setSinger}
                />
              </div>
            </div>

            {/* 04 Notes */}
            <div className="edit-card">
              <div className="edit-card-head">
                <span className="edit-card-step">04</span> Notes
                <span className="edit-card-meta" style={{ marginLeft: 8 }}>internal · not shown publicly</span>
              </div>
              <div className="edit-card-body">
                <textarea
                  className="edit-textarea"
                  placeholder="Mod notes about this entry…"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Danger zone — delete only */}
            <div className="edit-danger-zone">
              <div className="edit-card-head" style={{ color: "var(--danger)" }}>⚠ Danger zone</div>
              <div className="edit-dz-row">
                <div>
                  <div className="edit-dz-title">Delete opening</div>
                  <div className="edit-dz-sub">
                    Removes from all groups, ratings, and comments. Cannot be undone.
                  </div>
                </div>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete opening
                </button>
              </div>
            </div>

          </main>

          {/* Sidebar — Activity only */}
          <aside className="edit-side">
            <div className="edit-panel">
              <div className="edit-panel-head">Activity</div>
              <div className="edit-panel-body">
                <div className="edit-activity">
                  {opening.reviewed_at && (
                    <div className="edit-act edit">
                      <div className="edit-act-dot" />
                      <div>
                        <div className="edit-act-text">Approved</div>
                        <div className="edit-act-time">
                          {new Date(opening.reviewed_at).toLocaleDateString("en-US", {
                            year: "numeric", month: "short", day: "numeric",
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="edit-act create">
                    <div className="edit-act-dot" />
                    <div>
                      <div className="edit-act-text">Submitted</div>
                      <div className="edit-act-time">
                        {new Date(opening.submitted_at).toLocaleDateString("en-US", {
                          year: "numeric", month: "short", day: "numeric",
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>

      </div>

      {/* Sticky save bar — fixed to viewport so it spans full width */}
      {isDirty && (
        <div className="edit-save-bar">
          <div className="edit-save-bar-inner wrap">
            <span className="edit-sb-status">
              <span className="edit-sb-dot" />
              <span className="edit-sb-lbl">Unsaved changes</span>
            </span>
            <span style={{ flex: 1 }} />
            <div className="edit-sb-actions">
              <button type="button" className="btn" onClick={discard} disabled={saving}>
                Discard
              </button>
              <button type="button" className="btn primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => !deleting && setConfirmDelete(false)}
        >
          <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="admin-modal-title">Delete this opening?</h2>
            <p className="admin-modal-body">
              You&apos;re about to permanently remove <strong>{opening.title}</strong>.
              All ratings and comments tied to it will remain in the database, but the
              opening disappears from the catalogue and all groups.
            </p>
            <p className="admin-modal-warning">This action cannot be undone.</p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn admin-modal-confirm"
                onClick={confirmAndDelete}
                disabled={deleting}
              >
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
