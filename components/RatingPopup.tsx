import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { pushToast } from "@/lib/toast";
import type { RateResponse, User } from "@/lib/types";

interface Props {
  openingId: string;
  user: User | null;
  initialAvg: number;
  initialCount: number;
  initialUserScore: number | null;
}

const SCORES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Mirrors the mockup palette — short words for "how it feels".
function feelLabel(score: number): { text: string; tone: "low" | "mid" | "high" } {
  if (score <= 2) return { text: "nope", tone: "low" };
  if (score <= 4) return { text: "mid", tone: "low" };
  if (score <= 6) return { text: "good", tone: "mid" };
  if (score <= 8) return { text: "great", tone: "mid" };
  if (score === 9) return { text: "banger", tone: "high" };
  return { text: "kino", tone: "high" };
}

// Anchored rating popup. Trigger sits in the score area; clicking it opens
// a 380px popover with a 10-segment pill that fills with a purple gradient
// up to the current/hovered score. Selecting a segment commits the rating.
// Errors surface via pushToast() so they appear in the bottom-right toast
// host rather than inside the popup.
export default function RatingPopup({
  openingId,
  user,
  initialAvg,
  initialCount,
  initialUserScore,
}: Props) {
  const [open, setOpen] = useState(false);
  const [score, setScore] = useState<number | null>(initialUserScore);
  const [hover, setHover] = useState<number | null>(null);
  const [avg, setAvg] = useState(initialAvg);
  const [count, setCount] = useState(initialCount);
  const [saving, setSaving] = useState(false);

  const anchorRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node)) setOpen(false);
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

  const commit = useCallback(
    async (s: number) => {
      if (!user || saving) return;
      setSaving(true);
      try {
        const res = await fetch("/api/rate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ opening_id: openingId, score: s }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Rating failed (${res.status})`);
        }
        const data: RateResponse = await res.json();
        setScore(data.user_score);
        setAvg(data.avg_rating);
        setCount(data.rating_count);
        pushToast({ kind: "success", message: `Rated ${data.user_score}/10` });
        setTimeout(() => setOpen(false), 250);
      } catch (err) {
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not save rating",
        });
      } finally {
        setSaving(false);
      }
    },
    [openingId, user, saving],
  );

  // Visual fill = hover when previewing, else committed score, else 0.
  const previewScore = hover ?? score ?? 0;
  const fillPct = previewScore * 10;
  const feel = previewScore > 0 ? feelLabel(previewScore) : null;

  return (
    <div className="rate-anchor" ref={anchorRef}>
      <div className="rate-summary">
        <div className="rate-summary-n">
          {avg.toFixed(1)}<em>/10</em>
        </div>
        <div className="rate-summary-ct">{count.toLocaleString()} ratings</div>
      </div>

      {user ? (
        <button
          type="button"
          className={`rate-btn${score !== null ? " rated" : ""}`}
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          {score !== null ? (
            <>
              YOUR RATING <strong>{score}</strong>
            </>
          ) : (
            "RATE THIS"
          )}
        </button>
      ) : (
        <Link href="/login" className="rate-btn">LOG IN TO RATE</Link>
      )}

      <div
        className={`rate-popup${open ? " open" : ""}`}
        role="dialog"
        aria-label="Rate this opening"
      >
        <div className="rate-popup-head">
          <span>Your rating</span>
          <button
            type="button"
            className="rate-popup-close"
            aria-label="Close"
            onClick={() => setOpen(false)}
          >
            ×
          </button>
        </div>

        <div
          className="rate-pill"
          onMouseLeave={() => setHover(null)}
          aria-label="Rating from 1 to 10"
        >
          <div
            className="rate-pill-fill"
            style={{ width: `${fillPct}%` }}
          />
          {SCORES.map((s) => (
            <button
              key={s}
              type="button"
              className={`rate-seg${s <= previewScore ? " active" : ""}`}
              onMouseEnter={() => setHover(s)}
              onFocus={() => setHover(s)}
              onClick={() => commit(s)}
              disabled={saving || !user}
              aria-label={`Rate ${s} out of 10`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="rate-below">
          <span className="rate-readout">
            {previewScore > 0 ? previewScore : "—"} <em>/ 10</em>
          </span>
          {feel && <span className={`rate-feel rate-feel-${feel.tone}`}>{feel.text}</span>}
        </div>
      </div>
    </div>
  );
}
