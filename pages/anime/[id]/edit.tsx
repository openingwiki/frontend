import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import Layout from "@/components/Layout";
import CoverUpload from "@/components/CoverUpload";
import { getAnime } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { pushToast } from "@/lib/toast";
import type { AnimeDetail, AnimeFormat, User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  anime: AnimeDetail;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || session.user.role !== "admin") {
    return { notFound: true };
  }
  const id = ctx.params?.id as string;
  try {
    const anime = await getAnime(id, session.cookie);
    return {
      props: {
        user: session.user,
        modQueueCount: session.modQueueCount,
        anime,
      },
    };
  } catch {
    return { notFound: true };
  }
};

const FORMATS: { value: AnimeFormat; label: string }[] = [
  { value: "tv",      label: "TV series" },
  { value: "film",    label: "Film" },
  { value: "ova_ona", label: "OVA / ONA" },
  { value: "special", label: "Special" },
];

export default function AnimeEditPage({ user, modQueueCount, anime }: Props) {
  const router = useRouter();

  const initialTitle = anime.title_english ?? anime.name;

  const [titleEnglish, setTitleEnglish] = useState(initialTitle);
  const [year, setYear] = useState(String(anime.year ?? ""));
  const [format, setFormat] = useState<AnimeFormat>(anime.format);
  const [referenceUrl, setReferenceUrl] = useState(anime.reference_url);
  const [coverKey, setCoverKey] = useState(anime.cover_image_key ?? "");

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isDirty =
    titleEnglish !== initialTitle ||
    year !== String(anime.year ?? "") ||
    format !== anime.format ||
    referenceUrl !== anime.reference_url ||
    coverKey !== (anime.cover_image_key ?? "");

  const save = async () => {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!titleEnglish.trim()) errs.title_english = "English title is required";
    const yearNum = Number(year);
    if (!Number.isFinite(yearNum) || yearNum < 1900) errs.year = "Year is required";
    if (!referenceUrl.trim()) errs.reference_url = "Reference link is required";
    if (!coverKey) errs.cover_image_key = "Cover image is required";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const res = await fetch("/api/admin/anime-update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: anime.id,
          title_english: titleEnglish.trim(),
          year: yearNum,
          format,
          reference_url: referenceUrl.trim(),
          cover_image_key: coverKey,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      pushToast({ kind: "success", message: "Anime updated" });
      router.push(`/anime/${anime.id}`);
    } catch (err) {
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "Save failed" });
      setSaving(false);
    }
  };

  const discard = () => router.push(`/anime/${anime.id}`);

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`Edit · ${initialTitle} · Opening Wiki`}
    >
      <div className="wrap">

        <div className="edit-crumb">
          <Link href="/">Home</Link>
          <span className="edit-crumb-sep">/</span>
          <Link href={`/anime/${anime.id}`}>{initialTitle}</Link>
          <span className="edit-crumb-sep">/</span>
          <span className="edit-crumb-here">Edit</span>
        </div>

        <div className="edit-head">
          <div>
            <div className="edit-eyebrow">
              <span className="edit-admin-badge">Admin · Editing</span>
            </div>
            <h1 className="edit-h1">Editing <em>{initialTitle}</em></h1>
            <div className="edit-sub" style={{ color: "var(--fg-4)" }}>id: {anime.id}</div>
          </div>
          <span style={{ flex: 1 }} />
          <div className="edit-head-actions">
            <Link href={`/anime/${anime.id}`} target="_blank" rel="noreferrer" className="btn">
              ↗ View page
            </Link>
          </div>
        </div>

        <div className="edit-page-grid">
          <main>

            {/* 01 Cover */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">01</span> Cover image</div>
              <div className="edit-card-body">
                <CoverUpload
                  entityType="anime"
                  aspect="poster"
                  initialPreviewUrl={anime.cover_image_url}
                  onUploaded={(key) => setCoverKey(key)}
                />
                {fieldErrors.cover_image_key && <span className="ferr">{fieldErrors.cover_image_key}</span>}
              </div>
            </div>

            {/* 02 Title */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">02</span> Title</div>
              <div className="edit-card-body">
                <div className={`edit-row${titleEnglish !== initialTitle ? " dirty" : ""}`}>
                  <label className="edit-label">
                    English title <span className="edit-req">*</span>
                    {titleEnglish !== initialTitle && <span className="edit-changed">unsaved</span>}
                  </label>
                  <input type="text" className="edit-input" value={titleEnglish} onChange={(e) => setTitleEnglish(e.target.value)} />
                  {fieldErrors.title_english && <span className="ferr">{fieldErrors.title_english}</span>}
                </div>
              </div>
            </div>

            {/* 03 Production */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">03</span> Production</div>
              <div className="edit-card-body">
                <div className="sub-grid-2">
                  <div className={`edit-row${year !== String(anime.year ?? "") ? " dirty" : ""}`}>
                    <label className="edit-label">Year <span className="edit-req">*</span></label>
                    <input type="text" inputMode="numeric" className="edit-input" value={year} onChange={(e) => setYear(e.target.value)} />
                    {fieldErrors.year && <span className="ferr">{fieldErrors.year}</span>}
                  </div>
                  <div className="edit-row">
                    <label className="edit-label">Format <span className="edit-req">*</span></label>
                    <select className="edit-input" value={format} onChange={(e) => setFormat(e.target.value as AnimeFormat)}>
                      {FORMATS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* 04 Verification */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">04</span> Verification</div>
              <div className="edit-card-body">
                <div className={`edit-row${referenceUrl !== anime.reference_url ? " dirty" : ""}`}>
                  <label className="edit-label">Reference link <span className="edit-req">*</span></label>
                  <input type="url" className="edit-input" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} />
                  <span className="edit-hint">AniList preferred — helps moderators verify the entry.</span>
                  {fieldErrors.reference_url && <span className="ferr">{fieldErrors.reference_url}</span>}
                </div>
              </div>
            </div>

          </main>
        </div>
      </div>

      {isDirty && (
        <div className="edit-save-bar">
          <div className="edit-save-bar-inner wrap">
            <span className="edit-sb-status">
              <span className="edit-sb-dot" />
              <span className="edit-sb-lbl">Unsaved changes</span>
            </span>
            <span style={{ flex: 1 }} />
            <div className="edit-sb-actions">
              <button type="button" className="btn" onClick={discard} disabled={saving}>Discard</button>
              <button type="button" className="btn primary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
