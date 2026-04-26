import Link from "next/link";
import { useCallback, useState } from "react";
import { pushToast } from "@/lib/toast";
import type { OpeningComment, User } from "@/lib/types";

interface Props {
  openingId: string;
  user: User | null;
  initialComments: OpeningComment[];
  // False when SSR couldn't load comments (rare — usually the API just returns
  // empty). Used to render a "comments unavailable" hint instead of the form.
  available: boolean;
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d`;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function isEdited(c: OpeningComment): boolean {
  if (!c.updated_at || !c.created_at) return false;
  // Backend always sets updated_at; treat anything > 1s drift as edited so
  // microsecond-level reformatting noise doesn't trigger the "(edited)" tag.
  return Math.abs(Date.parse(c.updated_at) - Date.parse(c.created_at)) > 1000;
}

interface CommentRowProps {
  comment: OpeningComment;
  user: User | null;
  onUpdated: (next: OpeningComment) => void;
  onDeleted: (id: string) => void;
}

function CommentRow({ comment: c, user, onUpdated, onDeleted }: CommentRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);

  const isAuthor = user?.id === c.author.id;
  const isMod = user?.role === "moderator" || user?.role === "admin";
  const canEdit = !!(user && isAuthor);
  const canDelete = !!(user && (isAuthor || isMod));

  const save = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    if (trimmed === c.body) {
      setEditing(false);
      return;
    }
    setBusy("save");
    try {
      const res = await fetch("/api/comments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id, body: trimmed }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Edit failed (${res.status})`);
      }
      const next: OpeningComment = await res.json();
      onUpdated(next);
      setEditing(false);
      pushToast({ kind: "success", message: "Comment updated" });
    } catch (err) {
      pushToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not update comment",
      });
    } finally {
      setBusy(null);
    }
  }, [c.body, c.id, draft, busy, onUpdated]);

  const remove = useCallback(async () => {
    if (busy) return;
    if (!confirm("Delete this comment?")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/comments?id=${encodeURIComponent(c.id)}`, {
        method: "DELETE",
      });
      if (!res.ok && res.status !== 204) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Delete failed (${res.status})`);
      }
      onDeleted(c.id);
      pushToast({ kind: "success", message: "Comment deleted" });
    } catch (err) {
      pushToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not delete comment",
      });
    } finally {
      setBusy(null);
    }
  }, [busy, c.id, onDeleted]);

  return (
    <li className="comments-item">
      <div className="comments-avatar" aria-hidden>
        {c.author.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.author.avatar_url} alt="" />
        ) : (
          initials(c.author.display_name)
        )}
      </div>
      <div className="comments-bubble">
        <header className="comments-bubble-head">
          <span className="comments-author">
            {c.author.display_name}
            {c.author.role && c.author.role !== "user" && (
              <span className={`comments-role role-${c.author.role}`}>{c.author.role}</span>
            )}
          </span>
          <span className="comments-when">
            {formatWhen(c.created_at)}
            {isEdited(c) && <span className="comments-edited"> · edited</span>}
          </span>
        </header>

        {editing ? (
          <>
            <textarea
              className="comments-edit-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={2000}
              rows={3}
              disabled={busy === "save"}
              autoFocus
            />
            <div className="comments-edit-actions">
              <span className="comments-form-counter">{draft.length} / 2000</span>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setDraft(c.body);
                  setEditing(false);
                }}
                disabled={busy === "save"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary sm"
                onClick={save}
                disabled={busy === "save" || draft.trim().length === 0}
              >
                {busy === "save" ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        ) : (
          <p className="comments-body">{c.body}</p>
        )}

        {!editing && (canEdit || canDelete) && (
          <div className="comments-actions">
            {canEdit && (
              <button
                type="button"
                className="comments-link-btn"
                onClick={() => setEditing(true)}
                disabled={busy !== null}
              >
                Edit
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                className="comments-link-btn danger"
                onClick={remove}
                disabled={busy !== null}
              >
                {busy === "delete" ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

export default function CommentsSection({
  openingId,
  user,
  initialComments,
  available,
}: Props) {
  const [comments, setComments] = useState<OpeningComment[]>(initialComments);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  const post = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = body.trim();
      if (!trimmed || posting || !user) return;
      setPosting(true);
      try {
        const res = await fetch("/api/comments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_id: openingId, body: trimmed }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Posting failed (${res.status})`);
        }
        const created: OpeningComment = await res.json();
        setComments((prev) => [created, ...prev]);
        setBody("");
        pushToast({ kind: "success", message: "Comment posted" });
      } catch (err) {
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not post comment",
        });
      } finally {
        setPosting(false);
      }
    },
    [body, openingId, posting, user],
  );

  const handleUpdated = useCallback(
    (next: OpeningComment) =>
      setComments((prev) => prev.map((c) => (c.id === next.id ? next : c))),
    [],
  );
  const handleDeleted = useCallback(
    (id: string) => setComments((prev) => prev.filter((c) => c.id !== id)),
    [],
  );

  // Email confirmation gate temporarily disabled.
  // const needsVerified = user && user.email_verified === false;
  const needsVerified = false;

  return (
    <section className="comments">
      <header className="comments-head">
        <h2 className="comments-title">Comments</h2>
        <span className="comments-count">{comments.length}</span>
      </header>

      {!available && (
        <p className="comments-hint">
          Comments aren’t available right now. Try refreshing in a moment.
        </p>
      )}

      {available && user && !needsVerified && (
        <form className="comments-form" onSubmit={post}>
          <div className="comments-avatar" aria-hidden>
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.avatar_url} alt="" />
            ) : (
              initials(user.display_name)
            )}
          </div>
          <div className="comments-form-body">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={2000}
              placeholder="Add a comment…"
              rows={3}
              disabled={posting}
            />
            <div className="comments-form-actions">
              <span className="comments-form-counter">{body.length} / 2000</span>
              <button
                type="submit"
                className="btn primary sm"
                disabled={posting || body.trim().length === 0}
              >
                {posting ? "Posting…" : "Post comment"}
              </button>
            </div>
          </div>
        </form>
      )}

      {available && user && needsVerified && (
        <p className="comments-hint">
          Confirm your email to post comments — check your inbox.
        </p>
      )}

      {available && !user && (
        <p className="comments-hint">
          <Link href="/login">Log in</Link> to leave a comment.
        </p>
      )}

      {available && comments.length === 0 ? (
        <p className="comments-empty">Be the first to share what you think.</p>
      ) : (
        <ul className="comments-list">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              user={user}
              onUpdated={handleUpdated}
              onDeleted={handleDeleted}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
