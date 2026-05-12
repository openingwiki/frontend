import { useCallback, useRef, useState } from "react";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface CoverUploadProps {
  entityType: "anime" | "singer";
  aspect?: "poster" | "square"; // poster = 2:3, square = 1:1
  // The current cover URL when editing — shown as the initial preview so the
  // admin can see what's there and decide whether to swap. Undefined means
  // "no existing cover" (new submission path).
  initialPreviewUrl?: string | null;
  onUploaded: (objectKey: string, previewUrl: string) => void;
}

export default function CoverUpload({
  entityType,
  aspect = "poster",
  initialPreviewUrl,
  onUploaded,
}: CoverUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialPreviewUrl ?? null);
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
