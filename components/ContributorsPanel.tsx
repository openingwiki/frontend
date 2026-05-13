import { useCallback, useEffect, useState } from "react";
import type { ContributorLeaderboard, ContributorRange } from "@/lib/api";

interface Props {
  initial: ContributorLeaderboard | null;
  meUserId?: string | null;
}

// Top contributors widget. Mirrors the design from Home.html:
// - Two tabs (This week / All-time) switching the time window.
// - Top-3 rows get accent / lighter foreground rank colors.
// - The viewer's own row is appended at the bottom when present
//   (only shown for logged-in users who have at least one submission
//   in the window; otherwise the backend omits the `you` field).
//
// SSR seeds the first tab; switching tabs hits the proxy and updates
// the local state. Fail-quietly: if a switch fetch fails the existing
// list stays put.
export default function ContributorsPanel({ initial, meUserId }: Props) {
  const [range, setRange] = useState<ContributorRange>(initial?.range ?? "week");
  const [board, setBoard] = useState<ContributorLeaderboard | null>(initial);
  const [pending, setPending] = useState(false);

  const fetchRange = useCallback(async (next: ContributorRange) => {
    setPending(true);
    try {
      const res = await fetch(`/api/submissions/leaderboard?range=${next}`, { credentials: "include" });
      if (!res.ok) return;
      const payload = await res.json();
      setBoard(payload?.data ?? null);
    } catch {
      /* keep the existing board */
    } finally {
      setPending(false);
    }
  }, []);

  useEffect(() => {
    if (initial && initial.range === range) return;
    fetchRange(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  const entries = board?.entries ?? [];
  const you = board?.you;
  // Don't duplicate the viewer's row if they're already in the top
  // list — the standalone "you" stripe only adds value when the
  // viewer is below the cutoff.
  const showYouRow = !!you && !entries.some((e) => e.user_id === meUserId);

  return (
    <div className="panel">
      <div className="panel-head">
        <span>Top contributors</span>
        <span style={{ color: "var(--fg-4)", letterSpacing: 0, textTransform: "none" }}>submissions</span>
      </div>
      <div className="lb-tabs">
        <button
          type="button"
          className={`lb-tab${range === "week" ? " on" : ""}`}
          onClick={() => setRange("week")}
        >
          This week
        </button>
        <button
          type="button"
          className={`lb-tab${range === "all" ? " on" : ""}`}
          onClick={() => setRange("all")}
        >
          All-time
        </button>
      </div>
      <div className="lb-list" aria-busy={pending}>
        {entries.length === 0 && (
          <div style={{ padding: "16px 14px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-4)" }}>
            No submissions yet this window.
          </div>
        )}
        {entries.map((e) => {
          const rankClass = e.rank <= 3 ? ` top-${e.rank}` : "";
          const isYou = !!meUserId && e.user_id === meUserId;
          return (
            <div key={e.user_id} className={`lb-item${rankClass}${isYou ? " is-you" : ""}`}>
              <span className="lb-rank">{e.rank}</span>
              <div className="lb-user">
                <div className="lb-name">
                  @{e.display_name}
                  {isYou && <span className="lb-you-tag">YOU</span>}
                </div>
              </div>
              <div className="lb-count">{e.count.toLocaleString()}</div>
            </div>
          );
        })}
      </div>
      {showYouRow && you && (
        <div className="lb-you-row">
          <span className="lb-rank">#{you.rank}</span>
          <div className="lb-user">
            <div className="lb-name">
              @{you.display_name}
              <span className="lb-you-tag">YOU</span>
            </div>
          </div>
          <div className="lb-count">{you.count.toLocaleString()}</div>
        </div>
      )}
    </div>
  );
}
