import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow, BigNum, Heart, TimerBar, Waveform } from "@/components/solo/atoms";
import { playClient, formatResponseMs } from "@/lib/play";
import type {
  SoloAnswerResponse, SoloOpening, SoloRound, SoloRun, SoloRunSummary,
} from "@/lib/play";
import type { User } from "@/lib/types";

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
type Phase =
  | { kind: "starting" }
  | { kind: "mode-reveal"; countdownMs: number; round: SoloRound; run: SoloRun }
  | { kind: "in-match"; round: SoloRound; run: SoloRun; clipPlayedMs: number }
  | { kind: "reveal"; result: SoloAnswerResponse; nextAt: number; run: SoloRun }
  | { kind: "ended"; run: SoloRun; summary: SoloRunSummary }
  | { kind: "error"; message: string };

const MODE_REVEAL_MS = 2000;
const REVEAL_HOLD_MS = 3500;

export default function SoloRunPage({ user, modQueueCount }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "starting" });
  // The browser-decoded audio element. We keep one across rounds so the
  // user-gesture autoplay grant carries over the run.
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // 1. start run on mount. CSRF + session cookies already in scope.
  useEffect(() => {
    let abandoned = false;
    playClient.startRun()
      .then(({ run, round }) => {
        if (abandoned) return;
        setPhase({ kind: "mode-reveal", countdownMs: MODE_REVEAL_MS, round, run });
      })
      .catch((err) => {
        if (abandoned) return;
        setPhase({ kind: "error", message: err.message ?? "Failed to start run" });
      });
    return () => { abandoned = true; };
  }, []);

  // 2. mode-reveal tick — counts down to 0, then drops us into in-match.
  useEffect(() => {
    if (phase.kind !== "mode-reveal") return;
    if (phase.countdownMs <= 0) {
      setPhase({ kind: "in-match", round: phase.round, run: phase.run, clipPlayedMs: 0 });
      return;
    }
    const t = setTimeout(() => {
      setPhase((p) => p.kind === "mode-reveal" ? { ...p, countdownMs: Math.max(0, p.countdownMs - 100) } : p);
    }, 100);
    return () => clearTimeout(t);
  }, [phase]);

  // 3. in-match: start the clip and tick the timer. Server tells us
  // the duration; we render the waveform progress from a local
  // wall-clock counter so seeking the audio mid-round doesn't desync.
  const inMatchStart = useRef<number>(0);
  useEffect(() => {
    if (phase.kind !== "in-match") return;
    inMatchStart.current = Date.now();
    if (audioRef.current) {
      try {
        audioRef.current.src = phase.round.clip_url;
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      } catch { /* autoplay block — UI is still usable */ }
    }
    const id = setInterval(() => {
      setPhase((p) => {
        if (p.kind !== "in-match") return p;
        const played = Date.now() - inMatchStart.current;
        if (played >= p.round.clip_duration_ms) {
          // 20s elapsed without an answer → server-side timeout (we
          // POST null and let the backend mark it wrong + decrement
          // lives, single source of truth).
          submitTimeout(p);
          return p;
        }
        return { ...p, clipPlayedMs: played };
      });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind, phase.kind === "in-match" ? phase.round.round_id : null]);

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
    if (rev.result.run_summary) {
      setPhase({ kind: "ended", run: rev.result.run, summary: rev.result.run_summary });
      return;
    }
    if (rev.result.next_round) {
      setPhase({ kind: "mode-reveal", countdownMs: MODE_REVEAL_MS, round: rev.result.next_round, run: rev.result.run });
    }
  };

  const submitTimeout = useCallback((p: Phase & { kind: "in-match" }) => {
    // Don't fire if we already moved on (e.g. user submitted in the
    // same tick).
    submitAnswer(p, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitAnswer = useCallback(async (p: Phase & { kind: "in-match" }, animeId: string | null) => {
    setPhase({ kind: "starting" });
    try {
      const response = await playClient.submitAnswer(p.run.id, {
        round_token: p.round.round_token,
        anime_id: animeId,
        client_response_ms: Date.now() - inMatchStart.current,
      });
      if (audioRef.current) {
        try { audioRef.current.pause(); } catch { /* */ }
      }
      setPhase({ kind: "reveal", result: response, nextAt: Date.now() + REVEAL_HOLD_MS, run: response.run });
    } catch (err: any) {
      setPhase({ kind: "error", message: err?.message ?? "Failed to submit answer" });
    }
  }, []);

  return (
    <>
      <Head><title>Solo run · Opening Wiki</title></Head>
      <audio ref={audioRef} preload="auto" />
      <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "100vh", fontFamily: SOLO.sans, display: "flex", flexDirection: "column" }}>
        <TopbarSolo />
        {phase.kind === "starting" && <CenterMessage text="Loading run…" />}
        {phase.kind === "error" && <ErrorScreen message={phase.message} />}
        {phase.kind === "mode-reveal" && (
          <ModeRevealScreen
            mode={phase.round.mode}
            countdownMs={phase.countdownMs}
            run={phase.run}
            round={phase.round}
          />
        )}
        {phase.kind === "in-match" && (
          <InMatchScreen
            round={phase.round}
            run={phase.run}
            playedMs={phase.clipPlayedMs}
            onSubmit={(animeId) => submitAnswer(phase, animeId)}
          />
        )}
        {phase.kind === "reveal" && (
          <RevealScreen result={phase.result} run={phase.result.run} />
        )}
        {phase.kind === "ended" && (
          <RunEndScreen run={phase.run} summary={phase.summary} user={user} />
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
      <Link href="/play" style={{ color: SOLO.accent, fontFamily: SOLO.mono, fontSize: 13, textDecoration: "none" }}>back to hub →</Link>
    </div>
  );
}

function Hud({ run, mode, label }: { run: SoloRun; mode?: string; label?: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "18px 40px", borderBottom: `1px solid ${SOLO.line}`,
    }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {[0, 1, 2].map((i) => (
          <Heart key={i} filled={i < run.lives} broken={i === run.lives && run.lives < 3} />
        ))}
        <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginLeft: 8, letterSpacing: "0.1em" }}>
          {run.lives} left
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
        <div style={{ fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: SOLO.fg3 }}>
          Round {String(run.score + (run.lives_regen ?? 0) + (3 - run.lives) + 1).padStart(2, "0")}
        </div>
        {mode && (
          <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.accent, letterSpacing: "0.2em", fontWeight: 600 }}>
            ● {mode.toUpperCase()}
          </div>
        )}
      </div>
      <BigNum value={`× ${run.streak}`} label={label ?? "streak"} size={36} align="right" />
    </div>
  );
}

function ModeRevealScreen({ mode, countdownMs, run, round }: { mode: string; countdownMs: number; run: SoloRun; round: SoloRound }) {
  const countdown = Math.ceil(countdownMs / 1000);
  return (
    <>
      <TimerBar pct={0} />
      <Hud run={run} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", width: 800, height: 800, borderRadius: "50%",
          background: `radial-gradient(circle, ${SOLO.accent}26 0%, transparent 60%)`,
          filter: "blur(20px)", pointerEvents: "none",
        }} />
        <div style={{ fontFamily: SOLO.mono, fontSize: 13, letterSpacing: "0.4em", color: SOLO.fg3, marginBottom: 24 }}>— MODE —</div>
        <div style={{
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

function InMatchScreen({ round, run, playedMs, onSubmit }: { round: SoloRound; run: SoloRun; playedMs: number; onSubmit: (animeId: string | null) => void }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; title: string; year: number | null }>>([]);
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
      <Hud run={run} mode={round.mode} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "40px 0 30px", position: "relative" }}>
        <div style={{
          position: "absolute", top: 20, right: 40,
          fontFamily: SOLO.mono, fontSize: 56, fontWeight: 500,
          letterSpacing: "-0.04em", color: secsLeft < 5 ? SOLO.danger : SOLO.fg, lineHeight: 1,
        }}>
          {secsLeft.toFixed(1)}<span style={{ color: SOLO.fg4, fontSize: 32 }}>s</span>
        </div>
        <div style={{
          position: "absolute", top: 28, left: 40,
          fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3,
          letterSpacing: "0.14em", textTransform: "uppercase",
        }}>
          clip · {(round.clip_duration_ms / 1000).toFixed(0)}s
        </div>
        <Waveform played={pct} />
        <div style={{ textAlign: "center", marginTop: 22, fontFamily: SOLO.sans, fontSize: 14, color: SOLO.fg3 }}>
          Name the anime. ↵ to submit.
        </div>
      </div>
      <div style={{ padding: "0 40px 32px", position: "relative" }}>
        {suggestions.length > 0 && (
          <div style={{
            position: "absolute", bottom: "100%", left: 40, right: 40,
            background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, borderRadius: 10,
            marginBottom: 8, overflow: "hidden",
            boxShadow: "0 -20px 50px -10px rgba(0,0,0,0.5)",
          }}>
            <div style={{ padding: "10px 16px", fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: SOLO.fg3, borderBottom: `1px solid ${SOLO.line}` }}>
              Anime matches
            </div>
            {suggestions.map((s, i) => (
              <div
                key={s.id}
                onClick={() => onSubmit(s.id)}
                onMouseEnter={() => setActiveIdx(i)}
                style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                  background: i === activeIdx ? SOLO.bg3 : "transparent",
                  borderLeft: i === activeIdx ? `2px solid ${SOLO.accent}` : "2px solid transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{
                  width: 38, height: 52, background: SOLO.bg2, borderRadius: 4,
                  border: `1px solid ${SOLO.line}`, flexShrink: 0,
                  backgroundImage: `repeating-linear-gradient(135deg, ${SOLO.bg3} 0 6px, ${SOLO.bg2} 6px 7px)`,
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SOLO.sans, fontWeight: 600, fontSize: 14, color: SOLO.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                  <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginTop: 2 }}>
                    {s.year ? `${s.year}` : "—"}
                  </div>
                </div>
                {i === activeIdx && (
                  <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, border: `1px solid ${SOLO.line2}`, padding: "2px 6px", borderRadius: 3 }}>↵</span>
                )}
              </div>
            ))}
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
          <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg4, border: `1px solid ${SOLO.line2}`, padding: "3px 8px", borderRadius: 4 }}>↵ submit</span>
        </div>
      </div>
    </>
  );
}

function RevealScreen({ result, run }: { result: SoloAnswerResponse; run: SoloRun }) {
  const correct = result.round_result.correct;
  const op = result.round_result.correct_opening;
  return (
    <>
      <div style={{ position: "absolute", top: 60, left: 0, right: 0, bottom: 0, background: correct ? `${SOLO.ok}10` : `${SOLO.danger}0d`, pointerEvents: "none" }} />
      <TimerBar pct={0.4} danger={!correct} />
      <Hud run={run} label={correct && result.round_result.life_regen ? "streak +1 · ♥+1" : correct ? "streak +1" : "streak reset"} />
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 40, position: "relative" }}>
        <div style={{ position: "absolute", top: 30, left: 40 }}>
          <Eyebrow color={correct ? SOLO.ok : SOLO.danger} dotColor={correct ? SOLO.ok : SOLO.danger}>
            {correct ? `Correct · ${formatResponseMs(result.round_result.your_response_ms)}` : "Time's up · 20.0s"}
          </Eyebrow>
        </div>
        <div style={{
          display: "grid", gridTemplateColumns: "auto 1fr", gap: 40, maxWidth: 880,
          background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, borderRadius: 14,
          padding: 36, position: "relative", overflow: "hidden",
        }}>
          <div style={{
            position: "absolute", inset: -1, borderRadius: 14, pointerEvents: "none",
            border: `1px solid ${correct ? SOLO.ok : SOLO.danger}55`,
            boxShadow: `0 0 40px ${correct ? SOLO.ok : SOLO.danger}33, inset 0 0 60px ${correct ? SOLO.ok : SOLO.danger}0a`,
          }} />
          <div style={{
            width: 200, height: 280, borderRadius: 8, background: SOLO.bg3,
            border: `1px solid ${SOLO.line2}`,
            backgroundImage: `repeating-linear-gradient(135deg, ${SOLO.bg3} 0 14px, #221c33 14px 15px)`,
            display: "grid", placeItems: "center",
            fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.14em", textTransform: "uppercase",
          }}>cover · 2:3</div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
            <div style={{ fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: correct ? SOLO.ok : SOLO.danger, marginBottom: 10 }}>
              {correct ? `✓ ${op?.title ?? "—"}` : "✕ The answer was"}
            </div>
            <h2 style={{ margin: 0, fontFamily: SOLO.sans, fontWeight: 800, fontSize: correct ? 56 : 48, letterSpacing: "-0.04em", lineHeight: 0.95, color: SOLO.fg }}>
              {correct ? op?.anime?.name ?? "—" : op?.title ?? "—"}
            </h2>
            <div style={{ fontFamily: SOLO.sans, fontSize: 17, color: SOLO.fg2, marginTop: 6 }}>
              {correct
                ? <>{op?.anime?.name ?? ""}</>
                : <>from <em style={{ fontStyle: "normal", color: SOLO.accent }}>{op?.anime?.name ?? "—"}</em></>}
            </div>
            <div style={{ display: "flex", gap: 36, marginTop: 28, paddingTop: 22, borderTop: `1px dashed ${SOLO.line2}` }}>
              <StatCell value={correct ? `+${result.round_result.score_delta}` : "+0"} label="score" color={correct ? SOLO.ok : SOLO.danger} />
              <StatCell value={formatResponseMs(result.round_result.your_response_ms)} label="your time" />
              <StatCell value={formatResponseMs(result.round_result.avg_player_response_ms)} label="avg player" />
              {op && (
                <StatCell value={op.avg_rating ? op.avg_rating.toFixed(1) : "—"} label="community" color={SOLO.accent} />
              )}
            </div>
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

function RunEndScreen({ run, summary, user }: { run: SoloRun; summary: SoloRunSummary; user: User | null }) {
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
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 40px 64px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", paddingBottom: 28, borderBottom: `1px solid ${SOLO.line}` }}>
          <div>
            <Eyebrow color={SOLO.danger} dotColor={SOLO.danger}>Run over · all lives spent</Eyebrow>
            <h1 style={{ margin: "14px 0 0", fontFamily: SOLO.sans, fontWeight: 800, fontSize: 88, letterSpacing: "-0.05em", lineHeight: 0.9 }}>
              <span style={{ color: SOLO.accent }}>{summary.score}</span> correct.
            </h1>
            <p style={{ margin: "14px 0 0", color: SOLO.fg2, fontSize: 16, maxWidth: 520, lineHeight: 1.55 }}>
              {user ? `Run as ${user.display_name}.` : "Anonymous run."} Longest streak this run: {summary.longest_streak}.
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <Link href="/play/run" style={{
              background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
              padding: "14px 22px", fontWeight: 600, fontSize: 14, cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 8, textDecoration: "none",
              boxShadow: `0 0 30px ${SOLO.accent}55`,
            }}>
              Run again
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M13 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/play" style={{
              background: "transparent", border: `1px solid ${SOLO.line2}`, color: SOLO.fg2,
              borderRadius: 8, padding: "14px 22px", fontWeight: 500, fontSize: 14, textDecoration: "none",
            }}>Back to hub</Link>
          </div>
        </header>

        <section style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20, marginTop: 32 }}>
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
            <div style={{ marginTop: 28, paddingTop: 22, borderTop: `1px dashed ${SOLO.line}`, display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 20 }}>
              <StatCell value={String(summary.longest_streak)} label="longest streak" />
              <StatCell value={String(summary.lives_regen)} label="lives regen'd" />
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
