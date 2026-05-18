import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import type { GetServerSideProps } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow, BigNum, Heart, TimerBar, Waveform } from "@/components/solo/atoms";
import { playClient, formatResponseMs } from "@/lib/play";
import type {
  SoloAnswerResponse, SoloOpening, SoloRound, SoloRun, SoloRunSummary,
} from "@/lib/play";
import type { User } from "@/lib/types";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import MatchRatePopup from "@/components/MatchRatePopup";

// How long the player can have the run page backgrounded (tab hidden,
// app switched away) before the run is auto-abandoned on return. Mirrors
// the matching 15s spec for PvP and the "I came back two hours later
// and was still in the same match" complaint that motivated this.
const IDLE_ABANDON_MS = 15_000;

// sessionStorage flag that forces the next /play/run mount to start a
// fresh run instead of resuming whatever /me/current points at. Set
// from the Exit button and the "Back to hub" path on the idle modal.
// Why this exists: the abandon POST is best-effort — if it 4xx's
// (e.g. transient CSRF or network), the player still expects to be
// out of the run. Without this flag, the next /me/current would
// re-hydrate the still-active run on the server and we'd land back
// in the same session that the user just clicked Exit on, which is
// the exact bug the user reported.
const FRESH_RUN_FLAG = "ow:force-fresh-run";

function markForceFreshRun() {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(FRESH_RUN_FLAG, "1"); } catch { /* */ }
}

function consumeForceFreshRun(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.sessionStorage.getItem(FRESH_RUN_FLAG);
    if (v) window.sessionStorage.removeItem(FRESH_RUN_FLAG);
    return v === "1";
  } catch {
    return false;
  }
}

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return {
      redirect: { destination: `/login?next=${encodeURIComponent("/play/run")}`, permanent: false },
    };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

// Run-flow state machine. Each phase is a distinct screen and only one
// is in-DOM at a time.
//
// mode-reveal and in-match phases carry a `clockOffsetMs` snapshot —
// the (serverNow - clientNow) difference computed when the round
// payload was received. Both phases then derive their visible
// countdown from server-anchored timestamps (play_at_ms, expires_at_ms)
// minus the client's current Date.now(), corrected by the offset.
// This is what makes the timer reload-safe: the next render after a
// reload re-derives the same remaining time off the server clock, so
// you can't refresh to reset the timer.
type Phase =
  | { kind: "starting" }
  | { kind: "mode-reveal"; tick: number; round: SoloRound; run: SoloRun; clockOffsetMs: number }
  | { kind: "in-match"; tick: number; round: SoloRound; run: SoloRun; clockOffsetMs: number; audioStarted: boolean }
  | { kind: "reveal"; result: SoloAnswerResponse; nextAt: number; run: SoloRun; timedOut: boolean }
  | { kind: "ended"; run: SoloRun; summary: SoloRunSummary }
  // library-cleared: distinct from ended. Triggered when the run ends
  // because the player answered every opening in the catalog. Renders
  // a celebration screen instead of the regular run-over summary.
  | { kind: "library-cleared"; run: SoloRun; summary: SoloRunSummary }
  | { kind: "error"; message: string };

const REVEAL_HOLD_MS = 3500;

// serverNow returns the server's current UTC ms, derived from the
// captured clock offset. Stays accurate even after Date.now() drifts.
function serverNow(clockOffsetMs: number) {
  return Date.now() + clockOffsetMs;
}

// clockOffsetFor captures the offset at the moment a round payload
// arrives: serverNow - clientNow. Future reads use serverNow() above.
function clockOffsetFor(round: SoloRound) {
  return round.server_now_ms - Date.now();
}

export default function SoloRunPage({ user, modQueueCount }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  // Bumped when the user clicks "Run again" so the start-run effect
  // re-fires and a fresh run is requested. A plain `<Link href="/play/run">`
  // doesn't work — Next.js treats it as same-route and skips the
  // re-mount, leaving the component stuck on the ended phase.
  const [runGen, setRunGen] = useState(0);
  // The browser-decoded audio element. We keep one across rounds so the
  // user-gesture autoplay grant carries over the run.
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Lock for in-flight submissions. We used to swap phase to "starting"
  // here (which paints a centered "Loading run…" between in-match and
  // reveal), but on mobile that one-frame flash reads as a page-shake.
  // The ref keeps the in-match UI on screen until the reveal arrives.
  const submittingRef = useRef(false);
  // Surfaces a "session ended" modal when the user returns to a
  // backgrounded tab more than IDLE_ABANDON_MS after they left it. The
  // run itself is already abandoned on the server by that point; the
  // modal just stops the page rendering whatever stale phase it
  // happened to be in.
  const [staleAbandoned, setStaleAbandoned] = useState(false);

  // Best-effort manual abandon. Used by both the Exit-run button and the
  // idle-return path. Errors are swallowed — the user is already
  // navigating away and a failed POST shouldn't block that.
  const abandonRun = useCallback(async (runID: string | null) => {
    if (!runID) return;
    try { await playClient.abandonRun(runID); } catch { /* */ }
  }, []);

  // Active run ID for the abandon hooks. `phase.kind` carries it
  // during play; on reveal/ended phases there's no run to abandon
  // (server has already wrapped it up), so we return null.
  const activeRunID = useMemo<string | null>(() => {
    switch (phase.kind) {
      case "mode-reveal":
      case "in-match":
        return phase.run.id;
      default:
        return null;
    }
  }, [phase]);

  // 1. On mount, try to resume an in-flight run first; only start a
  // fresh one if there's no active run on the server. This is what
  // closes the reload-skip-countdown abuse path: a reload during the
  // inter-round wait now re-derives the same round + same server
  // anchors instead of dumping the run and getting a fresh 2s
  // mode-reveal. runGen bump (from "Run again") explicitly skips the
  // resume and goes straight to start.
  useEffect(() => {
    let abandoned = false;
    // Consume the force-fresh flag once per mount. A previous Exit
    // (or idle-modal "Back to hub") sets it; we skip the resume
    // probe and go straight to startRun(), which on the backend
    // closes any lingering active run before issuing a new one.
    const forceFresh = consumeForceFreshRun();
    setPhase({ kind: "starting" });
    submittingRef.current = false;
    const start = async () => {
      try {
        if (runGen === 0 && !forceFresh) {
          const current = await playClient.currentRun();
          if (current?.current_round) {
            if (abandoned) return;
            const round = current.current_round;
            // Already past the deadline? Send a timeout-null answer
            // so the server resolves the round; then the response
            // carries the next round and we slide into reveal.
            const now = round.server_now_ms + (Date.now() - round.server_now_ms);
            if (round.expires_at_ms <= now) {
              try {
                const response = await playClient.submitAnswer(current.run.id, {
                  round_token: round.round_token,
                  anime_id: null,
                  client_response_ms: round.clip_duration_ms,
                });
                if (abandoned) return;
                setPhase({
                  kind: "reveal",
                  result: response,
                  nextAt: Date.now() + REVEAL_HOLD_MS,
                  run: response.run,
                  timedOut: true,
                });
                return;
              } catch {
                // Fall through to starting fresh if the timeout
                // submit fails (e.g. round already resolved).
              }
            }
            setPhase({ kind: "mode-reveal", tick: 0, round, run: current.run, clockOffsetMs: clockOffsetFor(round) });
            return;
          }
        }
        const { run, round } = await playClient.startRun();
        if (abandoned) return;
        setPhase({ kind: "mode-reveal", tick: 0, round, run, clockOffsetMs: clockOffsetFor(round) });
      } catch (err: any) {
        if (abandoned) return;
        setPhase({ kind: "error", message: err?.message ?? "Failed to start run" });
      }
    };
    start();
    return () => { abandoned = true; };
  }, [runGen]);

  // 2. mode-reveal tick — count down to play_at_ms using the server
  // clock anchor. Once we cross it, drop into in-match. Re-rendering
  // every 100ms is cheap; only the `tick` counter changes.
  useEffect(() => {
    if (phase.kind !== "mode-reveal") return;
    const remaining = phase.round.play_at_ms - serverNow(phase.clockOffsetMs);
    if (remaining <= 0) {
      setPhase({ kind: "in-match", tick: 0, round: phase.round, run: phase.run, clockOffsetMs: phase.clockOffsetMs, audioStarted: false });
      return;
    }
    const t = setTimeout(() => {
      setPhase((p) => p.kind === "mode-reveal" ? { ...p, tick: p.tick + 1 } : p);
    }, Math.min(100, remaining));
    return () => clearTimeout(t);
  }, [phase]);

  // 3. in-match: start the clip and tick the timer off the server
  // clock. The "remaining" countdown is derived from expires_at_ms,
  // not a local stopwatch — so reloading the page keeps the same
  // deadline. Audio start is one-shot (audioStarted flag); audio
  // continues to play once started, the visible bar is what the
  // server clock drives.
  useEffect(() => {
    if (phase.kind !== "in-match") return;
    if (!phase.audioStarted) {
      if (audioRef.current) {
        try {
          audioRef.current.src = phase.round.clip_url;
          // Skip into the clip by however much time has already
          // elapsed since play_at_ms (covers reload mid-clip).
          const elapsed = Math.max(0, serverNow(phase.clockOffsetMs) - phase.round.play_at_ms);
          audioRef.current.currentTime = elapsed / 1000;
          audioRef.current.play().catch(() => {});
        } catch { /* autoplay block — UI is still usable */ }
      }
      setPhase((p) => p.kind === "in-match" ? { ...p, audioStarted: true } : p);
      return;
    }
    const remaining = phase.round.expires_at_ms - serverNow(phase.clockOffsetMs);
    if (remaining <= 0) {
      // Deadline passed without an answer → server-side timeout (POST
      // null, backend marks wrong + decrements lives, single source
      // of truth).
      submitTimeout(phase);
      return;
    }
    const id = setTimeout(() => {
      setPhase((p) => p.kind === "in-match" ? { ...p, tick: p.tick + 1 } : p);
    }, Math.min(100, remaining));
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // 4. reveal → auto-advance after REVEAL_HOLD_MS. If the result was
  // run-over the server has already attached a summary; we land on the
  // ended phase directly.
  useEffect(() => {
    if (phase.kind !== "reveal") return;
    const timeUntilAdvance = phase.nextAt - Date.now();
    if (timeUntilAdvance <= 0) {
      advanceFromReveal(phase);
      return;
    }
    const t = setTimeout(() => advanceFromReveal(phase), timeUntilAdvance);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const advanceFromReveal = (rev: Phase & { kind: "reveal" }) => {
    // library_cleared takes precedence over a regular run-end: both
    // carry a summary, but the cleared screen is the celebratory
    // variant. Without this branch the player would see the normal
    // "all lives spent" screen after answering every opening, which
    // is wrong (their run ended because they won, not died).
    if (rev.result.library_cleared && rev.result.run_summary) {
      setPhase({ kind: "library-cleared", run: rev.result.run, summary: rev.result.run_summary });
      return;
    }
    if (rev.result.run_summary) {
      setPhase({ kind: "ended", run: rev.result.run, summary: rev.result.run_summary });
      return;
    }
    if (rev.result.next_round) {
      const next = rev.result.next_round;
      setPhase({ kind: "mode-reveal", tick: 0, round: next, run: rev.result.run, clockOffsetMs: clockOffsetFor(next) });
    }
  };

  const submitTimeout = useCallback((p: Phase & { kind: "in-match" }) => {
    // Don't fire if we already moved on (e.g. user submitted in the
    // same tick).
    submitAnswer(p, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab/visibility tracking for the 15s idle auto-abandon. Player
  // tabs away (visibilitychange) → we stamp the timestamp; player
  // comes back → if the gap exceeded IDLE_ABANDON_MS we POST abandon
  // and surface the "session ended" modal. Mid-round backgrounding
  // inside the threshold is allowed — the regular timer still
  // governs round outcome.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!activeRunID || staleAbandoned) return;
    let hiddenAt: number | null = null;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt === null) return;
      const idle = Date.now() - hiddenAt;
      hiddenAt = null;
      if (idle >= IDLE_ABANDON_MS) {
        void abandonRun(activeRunID);
        setStaleAbandoned(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [activeRunID, staleAbandoned, abandonRun]);

  const submitAnswer = useCallback(async (p: Phase & { kind: "in-match" }, animeId: string | null) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    // Pause audio immediately so the user gets feedback that the submit
    // registered, but keep the in-match screen mounted — the reveal card
    // replaces it directly once the response lands, no centered-loading
    // flash in between.
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch { /* */ }
    }
    try {
      const response = await playClient.submitAnswer(p.run.id, {
        round_token: p.round.round_token,
        anime_id: animeId,
        client_response_ms: Math.max(0, serverNow(p.clockOffsetMs) - p.round.play_at_ms),
      });
      // `animeId === null` only happens via the clip-timer's `submitTimeout`
      // path — the user never had a chance to guess. Tracking it client-side
      // lets the reveal screen distinguish a wrong submission ("Wrong · 4.2s")
      // from an unanswered round ("Time's up · 20.0s"). Backend response
      // doesn't carry a status flag yet.
      setPhase({
        kind: "reveal",
        result: response,
        nextAt: Date.now() + REVEAL_HOLD_MS,
        run: response.run,
        timedOut: animeId === null,
      });
    } catch (err: any) {
      setPhase({ kind: "error", message: err?.message ?? "Failed to submit answer" });
    } finally {
      submittingRef.current = false;
    }
  }, []);

  return (
    <>
      <Head>
        <title>Solo run · Opening Wiki</title>
        {/* run.tsx doesn't go through Layout, so it needs its own viewport
            meta with `interactive-widget=resizes-content` for the smooth
            on-screen-keyboard handling on supported browsers. */}
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
      </Head>
      <audio ref={audioRef} preload="auto" />
      <div data-mobile-game style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "100vh", fontFamily: SOLO.sans, display: "flex", flexDirection: "column" }}>
        <TopbarSolo />
        {phase.kind === "starting" && <CenterMessage text="Loading run…" />}
        {phase.kind === "error" && <ErrorScreen message={phase.message} />}
        {phase.kind === "mode-reveal" && (
          <ModeRevealScreen
            mode={phase.round.mode}
            countdownMs={Math.max(0, phase.round.play_at_ms - serverNow(phase.clockOffsetMs))}
            run={phase.run}
            round={phase.round}
            onExit={async () => {
              // Flag-before-await: if the abandon POST 4xx's, we still
              // want the next /play/run mount to start fresh instead of
              // resuming the run the player just exited.
              markForceFreshRun();
              await abandonRun(phase.run.id);
              router.push("/play/endless");
            }}
          />
        )}
        {phase.kind === "in-match" && (
          <InMatchScreen
            round={phase.round}
            run={phase.run}
            playedMs={Math.max(0, serverNow(phase.clockOffsetMs) - phase.round.play_at_ms)}
            onSubmit={(animeId) => submitAnswer(phase, animeId)}
            onExit={async () => {
              // Flag-before-await: if the abandon POST 4xx's, we still
              // want the next /play/run mount to start fresh instead of
              // resuming the run the player just exited.
              markForceFreshRun();
              await abandonRun(phase.run.id);
              router.push("/play/endless");
            }}
          />
        )}
        {phase.kind === "reveal" && (
          <RevealScreen result={phase.result} run={phase.result.run} timedOut={phase.timedOut} signedIn={!!user} />
        )}
        {phase.kind === "ended" && (
          <RunEndScreen
            run={phase.run}
            summary={phase.summary}
            user={user}
            onRestart={() => setRunGen((g) => g + 1)}
          />
        )}
        {phase.kind === "library-cleared" && (
          <LibraryClearedScreen
            run={phase.run}
            summary={phase.summary}
            onRestart={() => setRunGen((g) => g + 1)}
          />
        )}
        {staleAbandoned && (
          <IdleSessionModal
            onAck={() => {
              // Idle-abandon may have raced the backend write the same
              // way the manual Exit can — mark the flag so the next
              // visit to /play/run doesn't dredge the stale run back up.
              markForceFreshRun();
              setStaleAbandoned(false);
              router.push("/play/endless");
            }}
            onRestart={() => { setStaleAbandoned(false); setRunGen((g) => g + 1); }}
          />
        )}
      </div>
    </>
  );
}

function TopbarSolo() {
  // Local topbar — the global Topbar is 60px and themed for the
  // catalog; we want the run page to feel like a distinct arcade
  // surface. Brand link goes back to /play so the user can drop out
  // without abandoning at random.
  return (
    <div style={{
      height: 60, borderBottom: `1px solid ${SOLO.line}`,
      background: "rgba(12,10,20,0.92)", backdropFilter: "blur(14px)",
      display: "flex", alignItems: "center", padding: "0 40px", gap: 36,
      position: "relative", zIndex: 5,
    }}>
      <Link href="/play" style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: 16, letterSpacing: "-0.02em", color: SOLO.fg, textDecoration: "none" }}>
        <span style={{ width: 18, height: 18, borderRadius: 5, background: SOLO.accent }} />
        Opening<span style={{ color: SOLO.accent }}>Wiki</span>
      </Link>
    </div>
  );
}

function CenterMessage({ text }: { text: string }) {
  return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: SOLO.fg3, fontFamily: SOLO.mono, fontSize: 14, letterSpacing: "0.12em" }}>
      {text}
    </div>
  );
}

function ErrorScreen({ message }: { message: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <Eyebrow color={SOLO.danger} dotColor={SOLO.danger}>Something went wrong</Eyebrow>
      <div style={{ color: SOLO.fg, fontSize: 18 }}>{message}</div>
      <Link href="/play/endless" style={{ color: SOLO.accent, fontFamily: SOLO.mono, fontSize: 13, textDecoration: "none" }}>back to hub →</Link>
    </div>
  );
}

// ExitRunButton — small ghost pill rendered in the in-match Hud. Calls
// the parent's onExit (which POSTs abandon + navigates) so the player
// can drop out without their run sitting open server-side. Without this
// the only way out was a hard nav, which left the run resumable from
// /me/current hours later — the bug we were asked to fix.
function ExitRunButton({ onExit }: { onExit: () => void }) {
  return (
    <button
      type="button"
      onClick={onExit}
      className="game-exit-btn"
      style={{
        display: "inline-flex", alignItems: "center", gap: 6,
        fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.14em",
        textTransform: "uppercase", color: SOLO.fg3,
        padding: "7px 10px 7px 9px",
        border: `1px solid ${SOLO.line2}`, borderRadius: 7,
        background: "rgba(255,255,255,0.02)", lineHeight: 1, whiteSpace: "nowrap",
        cursor: "pointer",
      }}
      aria-label="Exit run"
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      Exit run
    </button>
  );
}

// IdleSessionModal — shown when the visibilitychange listener detects
// the user returned to a tab that had been backgrounded longer than
// IDLE_ABANDON_MS. By the time this paints the run is already
// abandoned on the server, so the modal's job is to (a) explain why
// the page isn't where they left it and (b) route them somewhere
// useful.
function IdleSessionModal({ onAck, onRestart }: { onAck: () => void; onRestart: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="idle-modal-title" style={{
      position: "fixed", inset: 0, background: "rgba(6,4,12,0.86)",
      backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 28, zIndex: 80,
    }}>
      <div style={{
        background: SOLO.bg2, border: `1px solid ${SOLO.warn}`, borderRadius: 14,
        padding: "28px 30px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12,
        textAlign: "center", maxWidth: 420, boxShadow: `0 0 50px ${SOLO.warn}33`,
      }}>
        <Eyebrow color={SOLO.warn} dotColor={SOLO.warn}>Session ended</Eyebrow>
        <h3 id="idle-modal-title" style={{ margin: 0, fontFamily: SOLO.sans, fontWeight: 700, fontSize: 22, letterSpacing: "-0.02em" }}>
          You were idle too long.
        </h3>
        <p style={{ margin: 0, color: SOLO.fg2, fontSize: 14, lineHeight: 1.55 }}>
          We closed your run after 15 seconds of being away so you don't drop back into a stale match.
        </p>
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button type="button" onClick={onAck} style={{
            background: "transparent", border: `1px solid ${SOLO.line2}`, color: SOLO.fg2,
            borderRadius: 8, padding: "10px 16px", fontFamily: SOLO.sans, fontWeight: 600, fontSize: 13, cursor: "pointer",
          }}>
            Back to hub
          </button>
          <button type="button" onClick={onRestart} style={{
            background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
            padding: "10px 16px", fontFamily: SOLO.sans, fontWeight: 600, fontSize: 13, cursor: "pointer",
            boxShadow: `0 0 18px ${SOLO.accent}44`,
          }}>
            New run
          </button>
        </div>
      </div>
    </div>
  );
}

function Hud({ run, mode, label, onExit }: { run: SoloRun; mode?: string; label?: string; onExit?: () => void }) {
  return (
    <div className="game-hud" style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "14px 40px", borderBottom: `1px solid ${SOLO.line}`,
    }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {onExit && <ExitRunButton onExit={onExit} />}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <Heart key={i} filled={i < run.lives} broken={i === run.lives && run.lives < 3} />
          ))}
          <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginLeft: 8, letterSpacing: "0.1em" }}>
            {run.lives} left
          </span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: SOLO.fg3 }}>
          Round {String(run.score + (3 - run.lives) + 1).padStart(2, "0")}
        </div>
        {mode && (
          <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.accent, letterSpacing: "0.2em", fontWeight: 600 }}>
            ● {mode.toUpperCase()}
          </div>
        )}
      </div>
      <BigNum value={`× ${run.streak}`} label={label ?? "streak"} size={32} align="right" />
    </div>
  );
}

function ModeRevealScreen({ mode, countdownMs, run, round, onExit }: { mode: string; countdownMs: number; run: SoloRun; round: SoloRound; onExit: () => void }) {
  const countdown = Math.ceil(countdownMs / 1000);
  return (
    <>
      <TimerBar pct={0} />
      <Hud run={run} onExit={onExit} />
      <div className="game-stage" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", width: 800, height: 800, borderRadius: "50%",
          background: `radial-gradient(circle, ${SOLO.accent}26 0%, transparent 60%)`,
          filter: "blur(20px)", pointerEvents: "none",
        }} />
        <div style={{ fontFamily: SOLO.mono, fontSize: 13, letterSpacing: "0.4em", color: SOLO.fg3, marginBottom: 24 }}>— MODE —</div>
        <div className="game-mode-big" style={{
          fontFamily: SOLO.sans, fontWeight: 900, fontSize: 200,
          letterSpacing: "-0.06em", lineHeight: 0.85, color: SOLO.fg,
          textShadow: `0 0 60px ${SOLO.accent}66`, position: "relative",
        }}>{mode.toUpperCase()}</div>
        <div style={{ fontFamily: SOLO.sans, fontSize: 17, color: SOLO.fg2, marginTop: 18, maxWidth: 480, textAlign: "center", lineHeight: 1.5 }}>
          {mode === "audio" ? "Ears only. No video. Just the sound of the opening." :
           mode === "visual" ? "A still frame. No music." :
           "Lyrics only — instrumental stripped out."}
        </div>
        <div style={{ marginTop: 60, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            border: `2px solid ${SOLO.accent}`, display: "grid", placeItems: "center",
            fontFamily: SOLO.mono, fontSize: 28, fontWeight: 600, color: SOLO.accent,
            boxShadow: `0 0 30px ${SOLO.accent}55, inset 0 0 20px ${SOLO.accent}22`,
          }}>{countdown}</div>
          <div style={{ fontFamily: SOLO.mono, fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: SOLO.fg3 }}>
            clip starts in
          </div>
        </div>
        <div style={{ position: "absolute", bottom: 24, right: 40, fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4 }}>
          round {round.round_no}
        </div>
      </div>
    </>
  );
}

function InMatchScreen({ round, run, playedMs, onSubmit, onExit }: { round: SoloRound; run: SoloRun; playedMs: number; onSubmit: (animeId: string | null) => void; onExit: () => void }) {
  // Keeps `--kbd-inset` on <html> in sync with the on-screen keyboard
  // height so the fixed-bottom search bar (and its suggestions) ride
  // above the keyboard instead of being covered.
  useKeyboardInset();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; title: string; year: number | null; cover: string | null }>>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  // Debounced autocomplete fetch — scoring is anime-based now, so we
  // hit /api/v1/anime/search instead of filtering openings.
  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/anime/search?q=${encodeURIComponent(query)}&limit=8`, { credentials: "include" });
        if (!res.ok) return;
        const body = await res.json();
        if (queryRef.current !== query) return;
        const items = (body?.data ?? []).slice(0, 8).map((a: any) => ({
          id: a.id,
          title: a.name || a.title_romaji,
          year: a.year ?? null,
          cover: a.cover_image_url ?? null,
        }));
        setSuggestions(items);
        setActiveIdx(0);
      } catch { /* swallow — typing isn't worth a toast */ }
    }, 120);
    return () => clearTimeout(handle);
  }, [query]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = suggestions[activeIdx];
      if (pick) onSubmit(pick.id);
    } else if (e.key === "Escape") {
      setQuery("");
      setSuggestions([]);
    }
  };

  const pct = Math.min(1, playedMs / round.clip_duration_ms);
  const secsLeft = Math.max(0, (round.clip_duration_ms - playedMs) / 1000);

  return (
    <>
      <TimerBar pct={pct} danger={secsLeft < 5} />
      <Hud run={run} mode={round.mode} onExit={onExit} />
      {/* Stage padding tightened from 40/30 to 20/16 and the waveform's
          intrinsic height reduced by passing a smaller `height` so the
          whole in-match view fits inside a typical laptop viewport
          (≥720px) without dropping the search input below the fold —
          the desktop-scroll complaint in the bug list. */}
      <div className="game-stage" style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "20px 0 16px", position: "relative", minHeight: 0 }}>
        <div className="game-clip-time" style={{
          position: "absolute", top: 14, right: 40,
          fontFamily: SOLO.mono, fontSize: 42, fontWeight: 500,
          letterSpacing: "-0.04em", color: secsLeft < 5 ? SOLO.danger : SOLO.fg, lineHeight: 1,
        }}>
          {secsLeft.toFixed(1)}<s style={{ color: SOLO.fg4, fontSize: 24 }}>s</s>
        </div>
        <div className="game-clip-label" style={{
          position: "absolute", top: 20, left: 40,
          fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3,
          letterSpacing: "0.14em", textTransform: "uppercase",
        }}>
          clip · {(round.clip_duration_ms / 1000).toFixed(0)}s
        </div>
        <Waveform played={pct} />
        <div style={{ textAlign: "center", marginTop: 12, fontFamily: SOLO.sans, fontSize: 13, color: SOLO.fg3 }}>
          Name the anime. ↵ to submit.
        </div>
      </div>
      <div className="game-input" style={{ padding: "0 40px 22px", position: "relative" }}>
        {suggestions.length > 0 && (
          <div className="game-suggs" style={{
            position: "absolute", bottom: "100%", left: 40, right: 40,
            background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, borderRadius: 10,
            marginBottom: 8, overflow: "hidden",
            boxShadow: "0 -20px 50px -10px rgba(0,0,0,0.5)",
          }}>
            <div style={{ padding: "10px 16px", fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: SOLO.fg3, borderBottom: `1px solid ${SOLO.line}` }}>
              Anime matches
            </div>
            {suggestions.map((s, i) => {
              const active = i === activeIdx;
              return (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  // pointerdown fires before the keyboard-close → viewport
                  // resize → click-cancellation cascade iOS Safari sometimes
                  // does when the user taps a suggestion. preventDefault()
                  // keeps the input focused so the keyboard stays put long
                  // enough for the submit to land. Applied to *every* row so
                  // the second/third suggestions are pickable too — the bug
                  // was that the previous design only rendered an Enter-key
                  // hint on the active row, which on mobile read as "the
                  // others aren't tappable".
                  onPointerDown={(e) => {
                    e.preventDefault();
                    onSubmit(s.id);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className="game-sugg-row"
                  style={{
                    display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                    minHeight: 44,
                    background: active ? SOLO.bg3 : "transparent",
                    borderLeft: active ? `2px solid ${SOLO.accent}` : "2px solid transparent",
                    cursor: "pointer",
                    WebkitTapHighlightColor: "rgba(167,139,250,0.18)",
                    touchAction: "manipulation",
                  }}
                >
                  <div style={{
                    width: 38, height: 52, borderRadius: 4,
                    border: `1px solid ${SOLO.line}`, flexShrink: 0,
                    overflow: "hidden",
                    background: s.cover ? "transparent" : SOLO.bg2,
                    backgroundImage: s.cover ? "none" : `repeating-linear-gradient(135deg, ${SOLO.bg3} 0 6px, ${SOLO.bg2} 6px 7px)`,
                  }}>
                    {s.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.cover} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SOLO.sans, fontWeight: 600, fontSize: 14, color: SOLO.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginTop: 2 }}>
                      {s.year ? `${s.year}` : "—"}
                    </div>
                  </div>
                  {/* Chevron on every row, not just the active one — the
                      affordance "this is tappable" should be uniform. */}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={active ? SOLO.accent : SOLO.fg4} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              );
            })}
          </div>
        )}
        <div style={{
          background: SOLO.bg2, border: `1px solid ${SOLO.accent}`,
          borderRadius: 10, padding: "16px 18px",
          boxShadow: `0 0 0 4px ${SOLO.accent}22, 0 -20px 60px -20px ${SOLO.accent}22`,
          display: "flex", alignItems: "center", gap: 14,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ color: SOLO.accent, flexShrink: 0 }} aria-hidden>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
            <path d="M20 20l-3-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Type the anime…"
            style={{
              flex: 1, fontSize: 18, fontWeight: 500, color: SOLO.fg,
              letterSpacing: "-0.01em", fontFamily: SOLO.sans,
              background: "transparent", border: "none", outline: "none",
            }}
          />
          <span className="game-submit-hint" style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg4, border: `1px solid ${SOLO.line2}`, padding: "3px 8px", borderRadius: 4 }}>↵ submit</span>
        </div>
      </div>
    </>
  );
}

function RevealScreen({ result, run, timedOut, signedIn }: { result: SoloAnswerResponse; run: SoloRun; timedOut: boolean; signedIn: boolean }) {
  const correct = result.round_result.correct;
  const op = result.round_result.correct_opening;
  // Distinguish the three round outcomes in the eyebrow: a hit, an
  // unanswered round (clip timer expired), or a submitted-but-wrong guess.
  const eyebrowText = correct
    ? `Correct · ${formatResponseMs(result.round_result.your_response_ms)}`
    : timedOut
      ? "Time's up · 20.0s"
      : `Wrong · ${formatResponseMs(result.round_result.your_response_ms)}`;
  return (
    <>
      {/* Page-wide tint covering the whole stage (including the topbar
          and HUD) so the success/fail flash isn't visually clipped at
          the top — previously `top: 60` left a purple strip up top. */}
      <div style={{ position: "fixed", inset: 0, background: correct ? `${SOLO.ok}26` : `${SOLO.danger}26`, pointerEvents: "none", zIndex: 50 }} />
      <TimerBar pct={0.4} danger={!correct} />
      <Hud run={run} label={correct ? "streak +1" : "streak reset"} />
      <div className="reveal-page" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, position: "relative" }}>
        <div className="reveal-eyebrow" style={{ position: "absolute", top: 30, left: 40 }}>
          <Eyebrow color={correct ? SOLO.ok : SOLO.danger} dotColor={correct ? SOLO.ok : SOLO.danger}>
            {eyebrowText}
          </Eyebrow>
        </div>
        {/* overflow: visible (default) — was previously "hidden" to
            contain the inset glow ring, but that clipped the rate
            popover off the bottom edge. The portaled popover no longer
            needs this card's overflow to be open, but flipping it
            keeps any future absolute-positioned descendants visible
            and matches the design source. */}
        <div className="reveal-card" style={{
          display: "grid", gridTemplateColumns: "auto 1fr", gap: 40, maxWidth: 880,
          background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, borderRadius: 14,
          padding: 36, position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: -1, borderRadius: 14, pointerEvents: "none",
            border: `1px solid ${correct ? SOLO.ok : SOLO.danger}55`,
            boxShadow: `0 0 40px ${correct ? SOLO.ok : SOLO.danger}33, inset 0 0 60px ${correct ? SOLO.ok : SOLO.danger}0a`,
          }} />
          <div className="reveal-cover" style={{
            width: 200, height: 280, borderRadius: 8, background: SOLO.bg3,
            border: `1px solid ${SOLO.line2}`,
            backgroundImage: op?.anime?.cover_image_url ? "none" : `repeating-linear-gradient(135deg, ${SOLO.bg3} 0 14px, #221c33 14px 15px)`,
            display: "grid", placeItems: "center", overflow: "hidden",
            fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.14em", textTransform: "uppercase",
          }}>
            {op?.anime?.cover_image_url
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={op.anime.cover_image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
              : <>cover · 2:3</>}
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: correct ? SOLO.ok : SOLO.danger, marginBottom: 10 }}>
              {correct ? `✓ ${op?.title ?? "—"}` : "✕ The answer was"}
            </div>
            <h2 className="reveal-headline" style={{ margin: 0, fontFamily: SOLO.sans, fontWeight: 800, fontSize: correct ? 56 : 48, letterSpacing: "-0.04em", lineHeight: 0.95, color: SOLO.fg }}>
              {correct ? op?.anime?.name ?? "—" : op?.title ?? "—"}
            </h2>
            <div style={{ fontFamily: SOLO.sans, fontSize: 17, color: SOLO.fg2, marginTop: 6 }}>
              {correct
                ? <>{op?.anime?.name ?? ""}</>
                : <>from <em style={{ fontStyle: "normal", color: SOLO.accent }}>{op?.anime?.name ?? "—"}</em></>}
            </div>
            <div className="reveal-stats" style={{ display: "flex", gap: 36, marginTop: 28, paddingTop: 22, borderTop: `1px dashed ${SOLO.line2}` }}>
              <StatCell value={correct ? `+${result.round_result.score_delta}` : "+0"} label="score" color={correct ? SOLO.ok : SOLO.danger} />
              <StatCell value={formatResponseMs(result.round_result.your_response_ms)} label="your time" />
              <StatCell value={formatResponseMs(result.round_result.avg_player_response_ms)} label="avg player" />
              {op && (
                <StatCell value={op.avg_rating ? op.avg_rating.toFixed(1) : "—"} label="community" color={SOLO.accent} />
              )}
            </div>
            {/* Rate-this-opening — same widget on every reveal card in
                Endless / 1v1. See components/MatchRatePopup for the
                portal-based positioning that keeps the dropdown out of
                the reveal card's clip rect. */}
            {op && (
              <div className="reveal-actions" style={{ marginTop: 18 }}>
                <MatchRatePopup openingId={op.id} signedIn={signedIn} />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function StatCell({ value, label, color = SOLO.fg }: { value: string; label: string; color?: string }) {
  return (
    <div>
      <div style={{ fontFamily: SOLO.mono, fontWeight: 500, fontSize: 28, color, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: SOLO.fg3, marginTop: 6 }}>{label}</div>
    </div>
  );
}

// LibraryClearedScreen — the "you broke the wiki" celebration. Shown
// when a run ends because the player answered every opening in the
// catalog. Layout mirrors the design HTML at
// `Endless Library Cleared.html`: error-log eyebrow on the left,
// glitched headline, action buttons, and a completion panel on the
// right with 100% coverage + run stats. Total openings comes from
// the summary's by_mode hits+total sum so we don't need a separate
// endpoint.
function LibraryClearedScreen({ run, summary, onRestart }: { run: SoloRun; summary: SoloRunSummary; onRestart: () => void }) {
  const totalAnswered = useMemo(() => {
    return summary.by_mode.reduce((acc, m) => acc + m.total, 0);
  }, [summary]);
  const lengthStr = useMemo(() => {
    const ended = run.ended_at ? new Date(run.ended_at).getTime() : Date.now();
    const total = Math.max(0, Math.floor((ended - new Date(run.started_at).getTime()) / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }, [run]);

  return (
    <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "100%", fontFamily: SOLO.sans }}>
      <div style={{
        maxWidth: 1200, margin: "0 auto", padding: "56px 64px 48px",
        display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 56, alignItems: "center",
      }}>
        <div>
          <Eyebrow color={SOLO.danger} dotColor={SOLO.danger}>Endless · queue empty</Eyebrow>
          <div style={{
            margin: "18px 0 32px", fontFamily: SOLO.mono, fontSize: 12, lineHeight: 1.75,
            color: SOLO.fg4, borderLeft: `2px solid ${SOLO.line2}`, paddingLeft: 14, maxWidth: 460,
          }}>
            <div><b style={{ color: SOLO.fg2, fontWeight: 500 }}>error:</b> queue.next() returned <span style={{ color: SOLO.danger }}>null</span></div>
            <div><b style={{ color: SOLO.fg2, fontWeight: 500 }}>cause:</b> all <span style={{ color: SOLO.accent }}>{totalAnswered.toLocaleString()}</span> openings already served this run</div>
            <div><b style={{ color: SOLO.fg2, fontWeight: 500 }}>status:</b> <span style={{ color: SOLO.ok }}>OK</span> · you win, technically</div>
          </div>
          <h1 style={{
            fontFamily: "'Instrument Serif', 'Times New Roman', serif", fontWeight: 400, fontSize: 124, lineHeight: 0.95,
            letterSpacing: "-0.04em", margin: 0, paddingBottom: 18, color: SOLO.fg,
          }}>
            You broke<br />the <em style={{ fontStyle: "italic", color: SOLO.accent }}>wiki.</em>
          </h1>
          <p style={{ margin: "0 0 32px", color: SOLO.fg2, fontSize: 15, maxWidth: 460, lineHeight: 1.6 }}>
            We literally <b>ran out of openings</b> to throw at you. The library has been your library now — take a victory lap, or come back when we've added more.
          </p>
          <div style={{ display: "flex", gap: 12 }}>
            <button onClick={onRestart} style={{
              background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
              padding: "14px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SOLO.sans,
              boxShadow: `0 0 30px ${SOLO.accent}55`,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
              Start a new run
            </button>
            <Link href="/play/endless" style={{
              background: "transparent", border: `1px solid ${SOLO.line2}`, color: SOLO.fg2,
              borderRadius: 8, padding: "14px 22px", fontWeight: 500, fontSize: 14, textDecoration: "none",
            }}>Back to home</Link>
          </div>
        </div>

        <div style={{ background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 12, padding: 28 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3, paddingBottom: 22,
            borderBottom: `1px solid ${SOLO.line}`,
          }}>
            <span>Run · <b style={{ color: SOLO.fg, fontWeight: 500 }}>complete</b></span>
            <span style={{ color: SOLO.fg4 }}>cleared</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "26px 0 20px" }}>
            <div style={{ fontFamily: "'Instrument Serif', 'Times New Roman', serif", fontSize: 84, fontWeight: 400, color: SOLO.accent, lineHeight: 0.9, letterSpacing: "-0.04em" }}>
              100<span style={{ fontSize: 48 }}>%</span>
            </div>
            <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3, lineHeight: 1.5 }}>
              <b style={{ color: SOLO.fg, fontWeight: 500 }}>{totalAnswered.toLocaleString()}</b> of <b style={{ color: SOLO.fg, fontWeight: 500 }}>{totalAnswered.toLocaleString()}</b><br />openings answered
            </div>
          </div>
          <div style={{
            display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20,
            paddingTop: 22, borderTop: `1px dashed ${SOLO.line}`,
          }}>
            <StatCell value={totalAnswered.toLocaleString()} label="answered" />
            <StatCell value={`×${summary.longest_streak}`} label="best streak" color={SOLO.accent} />
            <StatCell value={lengthStr} label="run · hh:mm" />
          </div>
        </div>
      </div>
    </div>
  );
}

function RunEndScreen({ run, summary, user, onRestart }: { run: SoloRun; summary: SoloRunSummary; user: User | null; onRestart: () => void }) {
  const lengthMs = useMemo(() => {
    const ended = run.ended_at ? new Date(run.ended_at).getTime() : Date.now();
    return ended - new Date(run.started_at).getTime();
  }, [run]);
  const lengthStr = useMemo(() => {
    const total = Math.max(0, Math.floor(lengthMs / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [lengthMs]);

  return (
    <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "100%", fontFamily: SOLO.sans }}>
      <div className="game-end-page" style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 40px 64px" }}>
        <header className="game-end-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 28, borderBottom: `1px solid ${SOLO.line}` }}>
          <div>
            <Eyebrow color={SOLO.danger} dotColor={SOLO.danger}>Run over · all lives spent</Eyebrow>
            <h1 style={{ margin: "14px 0 0", fontFamily: SOLO.sans, fontWeight: 800, fontSize: 88, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
              <span style={{ color: SOLO.accent }}>{summary.score}</span> correct.
            </h1>
            <p style={{ margin: "14px 0 0", color: SOLO.fg2, fontSize: 16, maxWidth: 520, lineHeight: 1.55 }}>
              {user ? `Run as ${user.display_name}.` : "Anonymous run."} Longest streak this run: {summary.longest_streak}.
            </p>
          </div>
          <div className="game-end-actions" style={{ display: "flex", gap: 12 }}>
            <button onClick={onRestart} style={{
              background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
              padding: "14px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8, fontFamily: SOLO.sans,
              boxShadow: `0 0 30px ${SOLO.accent}55`,
            }}>
              Run again
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <Link href="/play/endless" style={{
              background: "transparent", border: `1px solid ${SOLO.line2}`, color: SOLO.fg2,
              borderRadius: 8, padding: "14px 22px", fontWeight: 500, fontSize: 14, textDecoration: "none",
            }}>Back to hub</Link>
          </div>
        </header>

        <section className="game-end-grid" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 32 }}>
          <div style={{ background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 12, padding: 28 }}>
            <Eyebrow>This run · by mode</Eyebrow>
            {summary.by_mode.length === 0 && (
              <div style={{ marginTop: 18, color: SOLO.fg3, fontFamily: SOLO.mono, fontSize: 12 }}>No rounds played.</div>
            )}
            {summary.by_mode.map((m) => {
              const pct = m.total > 0 ? m.hits / m.total : 0;
              return (
                <div key={m.mode} style={{ marginTop: 22 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                    <span style={{ fontFamily: SOLO.mono, fontSize: 13, letterSpacing: "0.16em", textTransform: "uppercase", color: SOLO.fg, fontWeight: 500 }}>{m.mode}</span>
                    <div style={{ display: "flex", gap: 18, fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3 }}>
                      <span>
                        <strong style={{ color: SOLO.fg, fontWeight: 500, fontSize: 14 }}>{m.hits}/{m.total}</strong>
                      </span>
                      <span>avg <strong style={{ color: SOLO.fg, fontWeight: 500, fontSize: 14 }}>{formatResponseMs(m.avg_response_ms)}</strong></span>
                    </div>
                  </div>
                  <div style={{ height: 8, background: SOLO.bg3, borderRadius: 4, overflow: "hidden", position: "relative" }}>
                    <div style={{
                      position: "absolute", inset: 0, right: `${(1 - pct) * 100}%`,
                      background: SOLO.accent, boxShadow: `0 0 12px ${SOLO.accent}88`,
                      borderRadius: 4,
                    }} />
                  </div>
                </div>
              );
            })}
            <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px dashed ${SOLO.line}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
              <StatCell value={String(summary.longest_streak)} label="longest streak" />
              <StatCell value={lengthStr} label="run length" />
              <StatCell value={String(summary.score)} label="final score" color={SOLO.accent} />
            </div>
          </div>

          {summary.missed_clips.length > 0 && (
            <div style={{ background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 12, padding: 28 }}>
              <Eyebrow color={SOLO.fg3} dotColor={SOLO.warn}>Clips you missed · review</Eyebrow>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 16 }}>
                {summary.missed_clips.slice(0, 6).map((m) => (
                  <Link href={`/openings/${encodeURIComponent(m.opening_id)}`} key={m.opening_id} style={{
                    background: SOLO.bg3, border: `1px solid ${SOLO.line2}`, borderRadius: 8, padding: 12,
                    textDecoration: "none", color: SOLO.fg,
                  }}>
                    <div style={{ fontFamily: SOLO.sans, fontSize: 13, fontWeight: 600, color: SOLO.fg, lineHeight: 1.2 }}>{m.title}</div>
                    <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, marginTop: 4, letterSpacing: "0.06em" }}>{m.anime_name}{m.year ? ` · ${m.year}` : ""}</div>
                  </Link>
                ))}
                {summary.missed_clips.length > 6 && (
                  <div style={{
                    background: "transparent", border: `1px dashed ${SOLO.line2}`, borderRadius: 8, padding: 12,
                    display: "flex", alignItems: "center", justifyContent: "center", minHeight: 60,
                    fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg4, letterSpacing: "0.08em",
                  }}>+ {summary.missed_clips.length - 6} more</div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
