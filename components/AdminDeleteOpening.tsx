import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { pushToast } from "@/lib/toast";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  openingId: string;
  openingTitle: string;
}

// Admin-only "Delete opening" button + confirm modal.
// The whole component returns null for non-admin users so it never appears
// to anyone else (the API still 403s in case someone forges the request).
export default function AdminDeleteOpening({ user, openingId, openingTitle }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  if (!user || user.role !== "admin") return null;

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/opening-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: openingId }),
      });
      if (!res.ok && res.status !== 204) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Delete failed (${res.status})`);
      }
      pushToast({ kind: "success", message: "Opening deleted" });
      // The opening no longer exists — bounce to the catalogue.
      router.replace("/");
    } catch (err) {
      pushToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not delete opening",
      });
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="admin-delete-btn"
        onClick={() => setOpen(true)}
        title="Delete this opening (admin only)"
      >
        🗑 Delete opening
      </button>

      {open && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Confirm opening deletion"
          onClick={() => !busy && setOpen(false)}
        >
          <div
            className="admin-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="admin-modal-title">Delete this opening?</h2>
            <p className="admin-modal-body">
              You're about to permanently remove <strong>{openingTitle}</strong>.
              All ratings and comments tied to it stay in the database, but the
              opening itself disappears from the catalogue and from any group
              that contains it.
            </p>
            <p className="admin-modal-warning">
              This action can't be undone from the UI.
            </p>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn admin-modal-confirm"
                onClick={confirm}
                disabled={busy}
              >
                {busy ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
