import Link from "next/link";
import type { GetServerSideProps } from "next";
import type { ReactNode } from "react";

import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow } from "@/components/solo/atoms";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

// /play is now a mode chooser: Endless (solo) and 1v1 (race).
// The Endless-specific hub (stats, leaderboard, big start CTA) lives
// at /play/endless. PvP creation is /play/pvp/new.
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
    },
  };
};

export default function PlayHub({ user, modQueueCount }: Props) {
  // Login-gate happens on the actual mode page, not the chooser, so
  // anon visitors can still see what's on offer.
  const endlessHref = user ? "/play/endless" : `/login?next=${encodeURIComponent("/play/endless")}`;
  const pvpHref = user ? "/play/pvp/new" : `/login?next=${encodeURIComponent("/play/pvp/new")}`;
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Play — Opening Wiki">
      <div data-mobile-play-hub style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", fontFamily: SOLO.sans }}>
        <div className="solo-page" style={{ maxWidth: 1120, margin: "0 auto", padding: "64px 40px 60px" }}>
          <div className="play-hub-head" style={{ paddingBottom: 36, borderBottom: `1px solid ${SOLO.line}` }}>
            <Eyebrow>Play</Eyebrow>
            <h1 style={{ margin: "14px 0 0", fontFamily: SOLO.sans, fontWeight: 800, fontSize: 64, letterSpacing: "-0.045em", lineHeight: 0.96 }}>
              Pick your <span style={{ color: SOLO.accent }}>mode.</span>
            </h1>
            <p style={{ margin: "14px 0 0", color: SOLO.fg2, fontSize: 15, maxWidth: 620, lineHeight: 1.55 }}>
              Two ways to play. <strong style={{ color: SOLO.fg, fontWeight: 500 }}>Endless</strong> is a private solo run ranked on a daily leaderboard.
              {" "}<strong style={{ color: SOLO.fg, fontWeight: 500 }}>1v1</strong> is a real-time race against a friend.
            </p>
          </div>

          <div className="play-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginTop: 32 }}>
            <ModeCard
              href={endlessHref}
              eyebrow="Endless · solo"
              title="Run it"
              accentWord="alone."
              desc="Three lives that regenerate every five in a row. Difficulty climbs with your streak. Daily leaderboard resets at midnight UTC."
              cta="Open Endless"
              meta={<>~ 8 min per run<br />daily ranked</>}
            />
            <ModeCard
              href={pvpHref}
              eyebrow="1v1 · race"
              title="Challenge a"
              accentWord="friend."
              desc="Both players, same clip, simultaneous. First to ten correct wins. Configure format and pool in the next step."
              cta="Open 1v1"
              meta={<>casual lobby<br />invite by link</>}
            />
          </div>

          {/* Tournaments teaser — phase-3 placeholder, no leaderboard. */}
          <div className="play-tournament-teaser" style={{
            marginTop: 22, padding: "18px 24px",
            background: SOLO.bg2, border: `1px dashed ${SOLO.line2}`, borderRadius: 10,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{
                fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.16em",
                textTransform: "uppercase", color: SOLO.fg4,
                border: `1px solid ${SOLO.line2}`, padding: "3px 8px", borderRadius: 4,
              }}>Soon</div>
              <div style={{ fontFamily: SOLO.sans, fontSize: 14, color: SOLO.fg2, lineHeight: 1.45 }}>
                <strong style={{ color: SOLO.fg, fontWeight: 600 }}>Tournaments</strong> — bracketed multi-round 1v1, Elo, seasons.
              </div>
            </div>
            <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em" }}>
              Phase 3 ↗
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

interface ModeCardProps {
  href: string;
  eyebrow: string;
  title: string;
  accentWord: string;
  desc: string;
  cta: string;
  meta: ReactNode;
}

// One mode card. Whole card is the link target — the visible button
// is a secondary visual cue; clicking anywhere on the card routes.
function ModeCard({ href, eyebrow, title, accentWord, desc, cta, meta }: ModeCardProps) {
  return (
    <Link href={href} className="play-mode-card" style={{
      textDecoration: "none", color: "inherit",
      background: `linear-gradient(135deg, ${SOLO.bg2} 0%, ${SOLO.bg3} 100%)`,
      border: `1px solid ${SOLO.line2}`, borderRadius: 12, padding: 32,
      position: "relative", overflow: "hidden",
      display: "flex", flexDirection: "column", minHeight: 340,
      cursor: "pointer",
    }}>
      <div style={{
        position: "absolute", top: -80, right: -80, width: 360, height: 360, borderRadius: "50%",
        background: `radial-gradient(circle, ${SOLO.accent}22 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <Eyebrow color={SOLO.fg3} dotColor={SOLO.accent}>{eyebrow}</Eyebrow>
      <h2 style={{
        margin: "14px 0 12px", fontFamily: SOLO.sans, fontWeight: 800,
        fontSize: 40, letterSpacing: "-0.035em", lineHeight: 1, maxWidth: 360,
      }}>
        {title} <span style={{ color: SOLO.accent }}>{accentWord}</span>
      </h2>
      <p style={{ margin: 0, color: SOLO.fg2, fontSize: 14, lineHeight: 1.55, maxWidth: 380 }}>
        {desc}
      </p>
      <div style={{ flex: 1, minHeight: 28 }} />
      <div className="play-mode-foot" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 18 }}>
        <span className="play-mode-cta" style={{
          background: SOLO.accent, color: SOLO.bg,
          border: "none", borderRadius: 8, padding: "12px 22px",
          fontFamily: SOLO.sans, fontWeight: 600, fontSize: 14, letterSpacing: "-0.01em",
          display: "inline-flex", alignItems: "center", gap: 10,
          boxShadow: `0 0 24px ${SOLO.accent}44`,
        }}>
          {cta}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em", textAlign: "right", lineHeight: 1.4 }}>
          {meta}
        </div>
      </div>
    </Link>
  );
}
