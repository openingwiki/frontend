import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import Layout from "@/components/Layout";
import CoverUpload from "@/components/CoverUpload";
import { getSinger } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { pushToast } from "@/lib/toast";
import type { SingerDetail, SingerType, User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  singer: SingerDetail;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || session.user.role !== "admin") {
    return { notFound: true };
  }
  const id = ctx.params?.id as string;
  try {
    const singer = await getSinger(id, session.cookie);
    return {
      props: {
        user: session.user,
        modQueueCount: session.modQueueCount,
        singer,
      },
    };
  } catch {
    return { notFound: true };
  }
};

const TYPES: { value: SingerType; label: string }[] = [
  { value: "solo",              label: "Solo artist" },
  { value: "band",              label: "Band" },
  { value: "idol_group",        label: "Idol group" },
  { value: "vocaloid_producer", label: "Vocaloid producer" },
  { value: "composer",          label: "Composer" },
  { value: "other",             label: "Other" },
];

export default function SingerEditPage({ user, modQueueCount, singer }: Props) {
  const router = useRouter();

  const [name, setName] = useState(singer.name);
  const [type, setType] = useState<SingerType>(singer.type ?? "solo");
  const [referenceUrl, setReferenceUrl] = useState(singer.reference_url ?? "");
  const [coverKey, setCoverKey] = useState(singer.cover_image_key ?? "");

  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const isDirty =
    name !== singer.name ||
    type !== (singer.type ?? "solo") ||
    referenceUrl !== (singer.reference_url ?? "") ||
    coverKey !== (singer.cover_image_key ?? "");

  const save = async () => {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!referenceUrl.trim()) errs.reference_url = "Reference link is required";
    if (!coverKey) errs.cover_image_key = "Photo is required";
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setSaving(true);
    setFieldErrors({});
    try {
      const res = await fetch("/api/admin/singer-update", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: singer.id,
          name: name.trim(),
          type,
          reference_url: referenceUrl.trim(),
          cover_image_key: coverKey,
        }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      pushToast({ kind: "success", message: "Singer updated" });
      router.push(`/singers/${singer.id}`);
    } catch (err) {
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "Save failed" });
      setSaving(false);
    }
  };

  const discard = () => router.push(`/singers/${singer.id}`);

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`Edit · ${singer.name} · Opening Wiki`}
    >
      <div className="wrap">

        <div className="edit-crumb">
          <Link href="/">Home</Link>
          <span className="edit-crumb-sep">/</span>
          <Link href={`/singers/${singer.id}`}>{singer.name}</Link>
          <span className="edit-crumb-sep">/</span>
          <span className="edit-crumb-here">Edit</span>
        </div>

        <div className="edit-head">
          <div>
            <div className="edit-eyebrow">
              <span className="edit-admin-badge">Admin · Editing</span>
            </div>
            <h1 className="edit-h1">Editing <em>{singer.name}</em></h1>
            <div className="edit-sub" style={{ color: "var(--fg-4)" }}>id: {singer.id}</div>
          </div>
          <span style={{ flex: 1 }} />
          <div className="edit-head-actions">
            <Link href={`/singers/${singer.id}`} target="_blank" rel="noreferrer" className="btn">
              ↗ View page
            </Link>
          </div>
        </div>

        <div className="edit-page-grid">
          <main>

            {/* 01 Photo */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">01</span> Photo</div>
              <div className="edit-card-body">
                <CoverUpload
                  entityType="singer"
                  aspect="square"
                  initialPreviewUrl={singer.cover_image_url}
                  onUploaded={(key) => setCoverKey(key)}
                />
                {fieldErrors.cover_image_key && <span className="ferr">{fieldErrors.cover_image_key}</span>}
              </div>
            </div>

            {/* 02 Identity */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">02</span> Identity</div>
              <div className="edit-card-body">
                <div className={`edit-row${name !== singer.name ? " dirty" : ""}`}>
                  <label className="edit-label">
                    Name <span className="edit-req">*</span>
                    {name !== singer.name && <span className="edit-changed">unsaved</span>}
                  </label>
                  <input type="text" className="edit-input" value={name} onChange={(e) => setName(e.target.value)} />
                  {fieldErrors.name && <span className="ferr">{fieldErrors.name}</span>}
                </div>
              </div>
            </div>

            {/* 03 About */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">03</span> About</div>
              <div className="edit-card-body">
                <div className="edit-row">
                  <label className="edit-label">Type <span className="edit-req">*</span></label>
                  <select className="edit-input" value={type} onChange={(e) => setType(e.target.value as SingerType)}>
                    {TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* 04 Verification */}
            <div className="edit-card">
              <div className="edit-card-head"><span className="edit-card-step">04</span> Verification</div>
              <div className="edit-card-body">
                <div className={`edit-row${referenceUrl !== (singer.reference_url ?? "") ? " dirty" : ""}`}>
                  <label className="edit-label">Reference link <span className="edit-req">*</span></label>
                  <input type="url" className="edit-input" value={referenceUrl} onChange={(e) => setReferenceUrl(e.target.value)} />
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
