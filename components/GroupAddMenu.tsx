import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushToast } from "@/lib/toast";
import type { Group, User } from "@/lib/types";

interface Props {
  user: User | null;
  openingId: string;
  groups: Group[];
  // IDs of the user's groups that already contain this opening (computed
  // server-side in /openings/[id] SSR). Membership is mutated optimistically
  // here and reflected in the trigger label / each row's ✓ marker.
  initialMemberships: string[];
}

const STAR_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
  </svg>
);
const PLUS_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const CHECK_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M5 12l5 5L20 7" />
  </svg>
);
const CHEVRON = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export default function GroupAddMenu({
  user,
  openingId,
  groups,
  initialMemberships,
}: Props) {
  const [open, setOpen] = useState(false);
  const [memberships, setMemberships] = useState<Set<string>>(
    () => new Set(initialMemberships),
  );
  const [pendingId, setPendingId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Keep local memberships in sync with SSR refreshes (e.g. router.replace
  // after a rate auto-adds the opening to the system "Rated" group).
  useEffect(() => {
    setMemberships(new Set(initialMemberships));
  }, [initialMemberships]);

  // Outside-click + Escape close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = useCallback(
    async (group: Group) => {
      if (!user || pendingId) return;
      // The system "Rated" group is auto-managed (rating an opening adds it)
      // — block manual toggles per backend's ErrSystemGroupLocked.
      if (group.is_system_rated) {
        pushToast({
          kind: "info",
          message: "Rated is auto-managed — rate the opening to add/remove",
        });
        return;
      }
      const isMember = memberships.has(group.id);
      const next = new Set(memberships);
      if (isMember) next.delete(group.id);
      else next.add(group.id);
      // Optimistic UI — flip first, revert on failure.
      setMemberships(next);
      setPendingId(group.id);
      try {
        const url = isMember ? "/api/group-remove" : "/api/group-add";
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_id: openingId, group_id: group.id }),
        });
        if (!res.ok && res.status !== 204) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Failed (${res.status})`);
        }
        pushToast({
          kind: "success",
          message: isMember
            ? `Removed from ${group.name}`
            : `Added to ${group.name}`,
        });
      } catch (err) {
        // Revert optimistic change on error.
        const reverted = new Set(memberships);
        if (isMember) reverted.add(group.id);
        else reverted.delete(group.id);
        setMemberships(reverted);
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not update group",
        });
      } finally {
        setPendingId(null);
      }
    },
    [user, pendingId, memberships, openingId],
  );

  if (!user) {
    return (
      <div className="panel rate-panel">
        <div className="panel-head"><span>Save to a group</span></div>
        <div className="rate-body">
          <p className="rate-hint">Log in to add this opening to your collections.</p>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/login" className="btn ghost sm" style={{ flex: 1, justifyContent: "center" }}>Log in</Link>
            <Link href="/signup" className="btn primary sm" style={{ flex: 1, justifyContent: "center" }}>Sign up</Link>
          </div>
        </div>
      </div>
    );
  }

  // Show user's manually-managed groups + Rated as an info row (read-only).
  const manualGroups = groups.filter((g) => !g.is_system_rated);
  const ratedGroup = groups.find((g) => g.is_system_rated);
  const totalMembershipCount = groups.filter((g) => memberships.has(g.id)).length;
  const inRated = ratedGroup ? memberships.has(ratedGroup.id) : false;

  const triggerLabel =
    totalMembershipCount > 0
      ? `In ${totalMembershipCount} group${totalMembershipCount === 1 ? "" : "s"}`
      : "Add to group";

  return (
    <div className="panel rate-panel">
      <div className="panel-head"><span>Save to groups</span></div>
      <div className="rate-body">
        <div className="grp-add" ref={wrapRef}>
          <button
            type="button"
            className={`btn primary sm grp-add-btn${open ? " on" : ""}`}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="listbox"
            aria-expanded={open}
            disabled={groups.length === 0}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {PLUS_ICON}
              <span>{triggerLabel}</span>
            </span>
            <span className={`grp-add-c${open ? " up" : ""}`}>{CHEVRON}</span>
          </button>

          {open && (
            <ul className="grp-add-pop" role="listbox">
              {ratedGroup && (
                <li>
                  <div
                    className={`grp-add-row system${inRated ? " on" : ""}`}
                    title="Rated is auto-managed — rate the opening to add/remove"
                  >
                    <span className="grp-add-row-icon">{STAR_ICON}</span>
                    <span className="grp-add-row-name">{ratedGroup.name}</span>
                    <span className="grp-add-row-tag">auto</span>
                    {inRated && <span className="grp-add-row-check">{CHECK_ICON}</span>}
                  </div>
                </li>
              )}

              {manualGroups.length === 0 ? (
                <li>
                  <div className="grp-add-empty">
                    No custom groups yet.{" "}
                    <Link href="/groups?new=1" onClick={() => setOpen(false)}>
                      Create one →
                    </Link>
                  </div>
                </li>
              ) : (
                manualGroups.map((g) => {
                  const isMember = memberships.has(g.id);
                  const isPending = pendingId === g.id;
                  return (
                    <li key={g.id}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={isMember}
                        className={`grp-add-row${isMember ? " on" : ""}`}
                        onClick={() => toggle(g)}
                        disabled={isPending}
                      >
                        <span className="grp-add-row-icon">
                          {PLUS_ICON}
                        </span>
                        <span className="grp-add-row-name">{g.name}</span>
                        {g.is_public && <span className="grp-add-row-tag public">public</span>}
                        {isPending && <span className="grp-add-row-tag">…</span>}
                        {isMember && <span className="grp-add-row-check">{CHECK_ICON}</span>}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>

        {groups.length === 0 && (
          <p className="rate-hint" style={{ marginTop: 12 }}>
            No groups yet.{" "}
            <Link href="/groups?new=1" style={{ color: "var(--accent)" }}>
              Create one →
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
