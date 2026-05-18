import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { pushToast } from "@/lib/toast";
import type { RateResponse } from "@/lib/types";

interface Props {
  // Opening to rate. Changing this clears the locally-tracked score so
  // the next reveal card opens with a clean trigger.
  openingId: string;
  // null when the viewer is anonymous — we render a "Log in to rate"
  // link instead of opening a popover. signedIn is preferred over a
  // generic disabled state so the link gives the user a path forward.
  signedIn: boolean;
}

// MatchRatePopup — rate-this-opening control surfaced on every reveal
// card in the match flow (Solo Endless `RevealScreen` and PvP
// `RoundEndView`). Mirrors the behavior of `components/RatingPopup`
// from /openings/[id]: 1–10 picker, clear, outside-click + Escape
// close, toasts on save/fail. Differences from the catalog popup:
//
//   1. The popover renders through a React portal, anchored to the
//      trigger by `getBoundingClientRect()` + position:fixed. The
//      reveal card is a flex layout with `overflow: hidden` (for the
//      glow-ring inset), which used to clip a position:absolute
//      child popover off the bottom — that was the bug we were asked
//      to fix here. A portal sidesteps any ancestor clipping.
//
//   2. The trigger compresses to a square icon button on mobile so
//      it fits next to the existing action row without wrapping.
//
//   3. We don't show avg/count next to the trigger — the reveal card
//      already prints "community ★ X.X" in its stats row, so a second
//      number would be visual noise.
//
//   4. Rating state is local: we don't preload the viewer's prior
//      score from the round payload (it isn't there). The button
//      shows "Rate" until the user picks a number, then "Rated N".
//      Clearing reverts to "Rate".
export default function MatchRatePopup({ openingId, signedIn }: Props) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [anchor, setAnchor] = useState<{ left: number; top: number; right: number; bottom: number } | null>(null);
  const [openUp, setOpenUp] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const previewScore = hover ?? score ?? 0;

  // Reset local state when the opening changes — reveal advances
  // every few seconds, so the popover for round N shouldn't carry
  // state into round N+1.
  useEffect(() => {
    setOpen(false);
    setScore(null);
    setHover(null);
    setAnchor(null);
  }, [openingId]);

  // Anchor calculation. Runs when we open the popup and on resize/
  // scroll while open so the popover tracks the trigger. We measure
  // the trigger's viewport rect and let the popover render with
  // position:fixed at those coords. The popover decides up-vs-down
  // based on whether there's at least ~240px below the trigger; if
  // not, it flips above. (240 ≈ head + 1-10 row + foot + arrow
  // padding.)
  const recompute = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    setOpenUp(spaceBelow < 240);
    setAnchor({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }, []);

  useEffect(() => {
    if (!open) return;
    recompute();
    const onScroll = () => recompute();
    const onResize = () => recompute();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, recompute]);

  // Outside-click + Escape. The trigger and the portal'd popover are
  // both checked; clicks on either keep the popup open. Using
  // mousedown rather than click so the close fires before a re-open
  // click would land on the trigger (which would otherwise toggle it
  // back open).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const commit = useCallback(async (n: number) => {
    if (!signedIn || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/rate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opening_id: openingId, score: n }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Rating failed (${res.status})`);
      }
      const data: RateResponse = await res.json();
      setScore(data.user_score ?? n);
      pushToast({ kind: "success", message: `Rated ${data.user_score ?? n}/10` });
      // Close shortly after — gives the chosen segment a moment to
      // flash so the action feels confirmed.
      setTimeout(() => setOpen(false), 200);
    } catch (err) {
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "Could not save rating" });
    } finally {
      setSaving(false);
    }
  }, [openingId, signedIn, saving]);

  const clear = useCallback(async () => {
    if (!signedIn || saving || score === null) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/rate?opening_id=${encodeURIComponent(openingId)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Clear failed (${res.status})`);
      }
      setScore(null);
      setHover(null);
      pushToast({ kind: "success", message: "Rating cleared" });
      setTimeout(() => setOpen(false), 150);
    } catch (err) {
      pushToast({ kind: "error", message: err instanceof Error ? err.message : "Could not clear rating" });
    } finally {
      setSaving(false);
    }
  }, [openingId, signedIn, saving, score]);

  if (!signedIn) {
    return (
      <Link href="/login" className="match-rate-trigger" aria-label="Log in to rate">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3l2.6 5.9 6.4.6-4.9 4.3 1.5 6.3L12 17l-5.6 3.1 1.5-6.3L3 9.5l6.4-.6L12 3z" />
        </svg>
        <span>Log in to rate</span>
      </Link>
    );
  }

  // Popover is rendered through a portal so an ancestor's
  // `overflow: hidden` (the reveal card has it on Solo's screen) can't
  // clip it. createPortal only runs once mounted — typeof document
  // gates SSR.
  const portalTarget = typeof document !== "undefined" ? document.body : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`match-rate-trigger${open ? " open" : ""}${score !== null ? " rated" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <svg className="star" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 3l2.6 5.9 6.4.6-4.9 4.3 1.5 6.3L12 17l-5.6 3.1 1.5-6.3L3 9.5l6.4-.6L12 3z" />
        </svg>
        <span className="label">Rate</span>
        {score !== null && <span className="score-chip">{score}</span>}
        <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && portalTarget && anchor && createPortal(
        <div
          ref={popRef}
          className={`match-rate-pop${openUp ? " open-up" : ""}`}
          role="dialog"
          aria-label="Rate this opening"
          style={openUp
            ? { left: Math.max(8, anchor.right - 300), top: Math.max(8, anchor.top - 8) }
            : { left: Math.max(8, anchor.right - 300), top: anchor.bottom + 8 }
          }
          onMouseLeave={() => setHover(null)}
        >
          <div className="head">
            <span className="h-title">Rate this opening</span>
            <span className="h-current">
              {previewScore > 0 ? <>{previewScore}<em> / 10</em></> : <em>— / 10</em>}
            </span>
          </div>
          <div className="rate10" role="group" aria-label="Rating from 1 to 10">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <button
                key={n}
                type="button"
                className={n <= previewScore ? "on" : ""}
                disabled={saving}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onClick={() => commit(n)}
                aria-label={`Rate ${n} out of 10`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="foot">
            <span className="foot-hint">Saves automatically · 1 = weakest</span>
            {score !== null && (
              <button type="button" className="clr" onClick={clear} disabled={saving}>
                {saving ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>
        </div>,
        portalTarget,
      )}
    </>
  );
}
