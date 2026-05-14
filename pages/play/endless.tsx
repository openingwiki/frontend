import Link from "next/link";
import type { GetServerSideProps } from "next";

import Layout from "@/components/Layout";
import { getSoloLeaderboard, getSoloMyStats } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow } from "@/components/solo/atoms";
import { formatResetCountdown, formatResponseMs } from "@/lib/play";
import type { SoloLeaderboard, SoloMyStats } from "@/lib/play";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  stats: SoloMyStats | null;
  leaderboard: SoloLeaderboard;
  apiOnline: boolean;
}

const FALLBACK_LEADERBOARD: SoloLeaderboard = {
  entries: [],
  resets_in_sec: 6 * 3600,
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);

  let stats: SoloMyStats | null = null;
  let leaderboard: SoloLeaderboard = FALLBACK_LEADERBOARD;
  let apiOnline = true;
  try {
    leaderboard = await getSoloLeaderboard(undefined, session.cookie);
    if (session.user) {
      stats = await getSoloMyStats(session.cookie).catch(() => null);
    }
  } catch {
    apiOnline = false;
  }
  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      stats,
      leaderboard,
      apiOnline,
    },
  };
};

export default function EndlessHub({ user, modQueueCount, stats, leaderboard, apiOnline }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Endless · solo — Opening Wiki">
      <div data-mobile-endless-hub style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", fontFamily: SOLO.sans }}>
        <div className="solo-page" style={{ maxWidth: 1120, margin: "0 auto", padding: "40px 40px 60px" }}>

          {/* Breadcrumb back to Play hub */}
          <div style={{
            fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em",
            marginBottom: 18, display: "flex", alignItems: "center", gap: 8,
          }}>
            <Link href="/play" style={{ color: SOLO.fg2, textDecoration: "none" }}>Play</Link>
            <span style={{ color: SOLO.fg4 }}>/</span>
            <span>Endless</span>
          </div>

          <header className="endless-head" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 32, paddingBottom: 28, borderBottom: `1px solid ${SOLO.line}` }}>
            <div>
              <Eyebrow color={SOLO.accent} dotColor={SOLO.accent}>Endless · solo</Eyebrow>
              <h1 style={{ margin: "12px 0 0", fontFamily: SOLO.sans, fontWeight: 800, fontSize: 56, letterSpacing: "-0.04em", lineHeight: 0.98 }}>
                Guess the anime. <span style={{ color: SOLO.accent }}>Alone.</span>
              </h1>
              <p style={{ margin: "12px 0 0", color: SOLO.fg2, fontSize: 15, maxWidth: 520, lineHeight: 1.55 }}>
                One run, three lives, a streak that keeps regenerating them. Daily leaderboard resets at midnight UTC.
              </p>
            </div>
            {stats && stats.runs_played > 0 && (
              <div style={{ display: "flex", gap: 24, fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.06em" }}>
                <div>
                  <div style={{ color: SOLO.fg, fontFamily: SOLO.sans, fontWeight: 600, fontSize: 14, marginBottom: 3 }}>{stats.runs_played} runs</div>
                  all time
                </div>
                {stats.todays_rank > 0 && (
                  <div>
                    <div style={{ color: SOLO.fg, fontFamily: SOLO.sans, fontWeight: 600, fontSize: 14, marginBottom: 3 }}>#{stats.todays_rank}</div>
                    today
                  </div>
                )}
              </div>
            )}
          </header>

          {!apiOnline && (
            <div style={{ marginTop: 24, padding: 16, borderRadius: 8, background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, color: SOLO.fg2 }}>
              The play backend is unreachable. The leaderboard below is empty until the API comes back.
            </div>
          )}

          {/* Endless start CTA */}
          <section className="endless-hero" style={{
            background: `linear-gradient(135deg, ${SOLO.bg2} 0%, ${SOLO.bg3} 100%)`,
            border: `1px solid ${SOLO.line2}`, borderRadius: 12, padding: 40,
            position: "relative", overflow: "hidden", minHeight: 280, marginTop: 28,
            display: "flex", flexDirection: "column",
          }}>
            <div style={{
              position: "absolute", top: -60, right: -60, width: 420, height: 420, borderRadius: "50%",
              background: `radial-gradient(circle, ${SOLO.accent}22 0%, transparent 70%)`,
              pointerEvents: "none",
            }} />
            <h2 style={{ margin: "0 0 10px", fontWeight: 800, fontSize: 48, letterSpacing: "-0.04em", lineHeight: 1, maxWidth: 640, position: "relative" }}>
              How far can you go before you slip?
            </h2>
            <p style={{ margin: 0, color: SOLO.fg2, fontSize: 15, maxWidth: 520, lineHeight: 1.55, position: "relative" }}>
              Three lives. Earn one back every five in a row. Difficulty climbs as you do. Run ends when you&apos;re out.
            </p>
            <div style={{ flex: 1, minHeight: 32 }} />
            <div className="endless-hero-foot" style={{ display: "flex", alignItems: "center", gap: 18, marginTop: 8, position: "relative" }}>
              {user ? (
                <Link href="/play/run" style={{
                  background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
                  padding: "14px 26px", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em",
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10,
                  textDecoration: "none",
                  boxShadow: `0 0 30px ${SOLO.accent}55`,
                }}>
                  Start run
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </Link>
              ) : (
                <Link href={`/login?next=${encodeURIComponent("/play/endless")}`} style={{
                  background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
                  padding: "14px 26px", fontWeight: 600, fontSize: 15, letterSpacing: "-0.01em",
                  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 10,
                  textDecoration: "none",
                  boxShadow: `0 0 30px ${SOLO.accent}55`,
                }}>
                  Log in to play
                </Link>
              )}
              <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, lineHeight: 1.4 }}>
                ~ 8 min<br />top-1000 pool
              </div>
            </div>
          </section>

          <section className="endless-stats-grid" style={{ display: "grid", gridTemplateColumns: stats ? "1fr 1.1fr" : "1fr", gap: 20, marginTop: 28 }}>
            {stats && (
              <div style={{ background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 12, padding: 24 }}>
                <Eyebrow>Your records · all-time</Eyebrow>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px 36px", marginTop: 18 }}>
                  {[
                    [String(stats.best_score), "best run"],
                    [String(stats.longest_streak), "longest streak"],
                    [formatResponseMs(stats.avg_response_ms), "avg response"],
                    [String(stats.runs_played), "runs played"],
                  ].map(([v, l]) => (
                    <div key={l}>
                      <div style={{ fontFamily: SOLO.mono, fontWeight: 500, fontSize: 32, letterSpacing: "-0.03em", color: SOLO.fg, lineHeight: 1 }}>{v}</div>
                      <div style={{ fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: SOLO.fg3, marginTop: 6 }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 22, paddingTop: 18, borderTop: `1px dashed ${SOLO.line}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>
                    Today&apos;s best · <span style={{ color: SOLO.accent }}>{stats.todays_best}</span>
                  </div>
                  {stats.todays_rank > 0 && (
                    <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>
                      You&apos;re <span style={{ color: SOLO.fg }}>#{stats.todays_rank}</span> today
                    </div>
                  )}
                </div>
              </div>
            )}

            <div style={{ background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 12, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Eyebrow>Daily leaderboard</Eyebrow>
                <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.08em" }}>
                  resets in {formatResetCountdown(leaderboard.resets_in_sec)}
                </div>
              </div>
              {leaderboard.entries.length === 0 && (
                <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, padding: 12 }}>
                  No runs today yet. Be the first.
                </div>
              )}
              {leaderboard.entries.slice(0, 10).map((e) => {
                const you = e.user_id === user?.id;
                return (
                  <LeaderboardRow key={e.run_id} rank={e.rank} name={e.display_name} score={e.score} you={you} />
                );
              })}
              {leaderboard.you && !leaderboard.entries.some((e) => e.user_id === user?.id) && (
                <>
                  <div style={{
                    display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 14, alignItems: "center",
                    padding: "8px 12px", marginBottom: 2, fontFamily: SOLO.mono, fontSize: 13, color: SOLO.fg4,
                  }}>
                    <div>…</div><div /><div />
                  </div>
                  <LeaderboardRow rank={leaderboard.you.rank} name="you" score={leaderboard.you.score} you />
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </Layout>
  );
}

function LeaderboardRow({ rank, name, score, you }: { rank: number | string; name: string; score: number; you?: boolean }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "34px 1fr auto", gap: 14, alignItems: "center",
      padding: "8px 12px", borderRadius: 6,
      background: you ? `${SOLO.accent}14` : "transparent",
      border: you ? `1px solid ${SOLO.accent}44` : "1px solid transparent",
      marginBottom: 2,
    }}>
      <div style={{ fontFamily: SOLO.mono, fontSize: 13, color: you ? SOLO.accent : SOLO.fg3, fontWeight: you ? 600 : 400 }}>{rank}</div>
      <div style={{ fontFamily: SOLO.sans, fontSize: 13, color: you ? SOLO.fg : SOLO.fg2, fontWeight: you ? 600 : 400 }}>
        {name}{you ? " (you)" : ""}
      </div>
      <div style={{ fontFamily: SOLO.mono, fontSize: 14, color: you ? SOLO.accent : SOLO.fg, fontWeight: 500 }}>{score}</div>
    </div>
  );
}
