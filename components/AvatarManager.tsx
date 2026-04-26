import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/router";
import { pushToast } from "@/lib/toast";
import type { User } from "@/lib/types";

interface Props {
  user: User;
  // "head" — large profile-head circle, no inline hint, Remove is a small ×
  //          floating in the top-right corner of the circle.
  // "block" — original 80px card with sibling actions/hint (kept for reuse).
  variant?: "head" | "block";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

// The circle IS the file picker trigger. Clicking (or activating with
// keyboard) opens a JPEG/PNG/WebP picker; the proxy at /api/me/avatar runs
// the presigned-PUT-then-PATCH dance and the page is refreshed via SSR.
export default function AvatarManager({ user, variant = "block" }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"upload" | "delete" | null>(null);
  // Optimistic preview so the user sees the new image instantly while the
  // server-side update lands (router refresh fetches the canonical version).
  const [optimistic, setOptimistic] = useState<string | null>(null);

  const openPicker = useCallback(() => {
    if (busy) return;
    inputRef.current?.click();
  }, [busy]);

  const upload = useCallback(
    async (file: File) => {
      if (busy) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
        pushToast({ kind: "error", message: "Use JPEG, PNG or WebP" });
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        pushToast({ kind: "error", message: "Max size is 5 MB" });
        return;
      }
      setBusy("upload");
      const previewUrl = URL.createObjectURL(file);
      setOptimistic(previewUrl);
      try {
        const fd = new FormData();
        fd.append("file", file, file.name);
        const res = await fetch("/api/me/avatar", { method: "POST", body: fd });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Upload failed (${res.status})`);
        }
        pushToast({ kind: "success", message: "Avatar updated" });
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (err) {
        setOptimistic(null);
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Avatar upload failed",
        });
      } finally {
        setBusy(null);
        URL.revokeObjectURL(previewUrl);
      }
    },
    [busy, router],
  );

  const remove = useCallback(
    async (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (busy) return;
      if (!confirm("Remove your avatar?")) return;
      setBusy("delete");
      try {
        const res = await fetch("/api/me/avatar", { method: "DELETE" });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Remove failed (${res.status})`);
        }
        setOptimistic(null);
        pushToast({ kind: "success", message: "Avatar removed" });
        router.replace(router.asPath, undefined, { scroll: false });
      } catch (err) {
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not remove avatar",
        });
      } finally {
        setBusy(null);
      }
    },
    [busy, router],
  );

  const shown = optimistic ?? user.avatar_url;
  const sizeClass = variant === "head" ? "avatar-trigger-head" : "avatar-large";

  const fileInput = (
    <input
      type="file"
      accept="image/jpeg,image/png,image/webp"
      ref={inputRef}
      style={{ display: "none" }}
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) upload(f);
        e.target.value = "";
      }}
    />
  );

  const trigger = (
    <button
      type="button"
      className={`${sizeClass} avatar-trigger${busy ? " busy" : ""}`}
      onClick={openPicker}
      disabled={busy !== null}
      aria-label={user.avatar_url ? "Change avatar" : "Upload avatar"}
      title={user.avatar_url ? "Click to change" : "Click to upload"}
    >
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="" />
      ) : (
        <span aria-hidden>{initials(user.display_name)}</span>
      )}
      <span className="avatar-overlay" aria-hidden>
        {busy === "upload" ? "Uploading…" : user.avatar_url ? "Change" : "Upload"}
      </span>
      {/* For the head variant the Remove control rides on the avatar itself
          as a tiny × in the top-right corner — no separate sidebar action. */}
      {variant === "head" && user.avatar_url && (
        <span
          role="button"
          tabIndex={0}
          aria-label="Remove avatar"
          className="avatar-remove-x"
          onClick={(e) => {
            e.stopPropagation();
            void remove();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              void remove();
            }
          }}
        >
          ×
        </span>
      )}
    </button>
  );

  if (variant === "head") {
    return (
      <>
        {fileInput}
        {trigger}
      </>
    );
  }

  return (
    <div className="avatar-manager">
      {trigger}
      <div className="avatar-actions">
        {fileInput}
        {user.avatar_url && (
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => void remove()}
            disabled={busy !== null}
          >
            {busy === "delete" ? "Removing…" : "Remove"}
          </button>
        )}
        <span className="avatar-hint">
          Click the circle to {user.avatar_url ? "change" : "upload"} ·
          JPEG, PNG, WebP · up to 5 MB
        </span>
      </div>
    </div>
  );
}
