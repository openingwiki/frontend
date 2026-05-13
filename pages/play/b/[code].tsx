import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import Layout from "@/components/Layout";
import { SOLO, Eyebrow, Waveform } from "@/components/solo/atoms";
import { loadSession } from "@/lib/session";
import {
  pvpClient,
  PvPSocket,
  type Frame,
  type PvPMatchView,
  type RoundStartData,
  type RoundEndData,
  type MatchEndData,
  type PlayerDisconnectData,
} from "@/lib/pvp";
import type { User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  code: string;
  initial: PvPMatchView | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    const code = encodeURIComponent(String(ctx.params?.code ?? ""));
    return { redirect: { destination: `/login?next=/play/b/${code}`, permanent: false } };
  }
  // The SSR fetch is intentionally lenient — if the match isn't
  // found we still render the page with `initial: null` and let the
  // client show a "Match not found" error. That matches the design
  // (rooms expire, the link still resolves so the visitor sees what
  // happened rather than a generic 404).
  const code = String(ctx.params?.code ?? "");
  let initial: PvPMatchView | null = null;
  try {
    const res = await fetch(
      `${process.env.API_BASE_URL || "http://localhost:8080"}/api/v1/play/pvp/matches/${encodeURIComponent(code)}`,
      { headers: session.cookie ? { cookie: session.cookie } : undefined, cache: "no-store" as RequestCache },
    );
    if (res.ok) {
      const body = await res.json();
      initial = body.data;
    }
  } catch {
    // fall through to null
  }
  return {
    props: { user: session.user, modQueueCount: session.modQueueCount, code, initial },
  };
};

// ── Phase model ──────────────────────────────────────────────────────
// One screen at a time. The WS drives transitions; REST mutations
// (ready/leave/cancel) round-trip through pvpClient and the server
// emits the resulting lobby.state which advances the phase.

type Phase =
  | { kind: "lobby" }
  | { kind: "countdown"; startsAtMs: number }
  | { kind: "reveal"; round: RoundStartData; countdownMs: number }
  | { kind: "playing"; round: RoundStartData; playedMs: number }
  | { kind: "round-end"; result: RoundEndData; round: RoundStartData; nextAt: number }
  | { kind: "ended"; result: MatchEndData; winner: string | null }
  | { kind: "error"; message: string }
  | { kind: "disconnected"; userID: string; graceExpiresAtMs: number };

const MODE_REVEAL_MS = 2000;
const ROUND_END_HOLD_MS = 3500;

export default function MatchPage({ user, modQueueCount, code, initial }: Props) {
  const router = useRouter();
  const [view, setView] = useState<PvPMatchView | null>(initial);
  const [phase, setPhase] = useState<Phase>(initial?.match?.status === "ended"
    ? { kind: "error", message: "This match has already ended." }
    : { kind: "lobby" });
  const [socketStatus, setSocketStatus] = useState<"connecting" | "open" | "closed">("connecting");
  // Running score across the whole match, keyed by user_id. Updated
  // on every round.end and the match.end frame so the in-match HUD
  // can keep showing the latest score during the playing phase
  // (round.start carries no score field — without this the HUD would
  // reset to 0–0 the moment a new round started).
  const [score, setScore] = useState<Record<string, number>>({});
  // Per-round summaries collected as round.end frames arrive. The
  // backend's match.end frame doesn't (yet) include the timeline —
  // collecting client-side gives us the rich payload (opening reveal,
  // response time, who won) for the end-screen timeline regardless.
  const [roundResults, setRoundResults] = useState<RoundEndData[]>([]);
  const sockRef = useRef<PvPSocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Refresh view from REST on mount + any time the phase resets to
  // lobby. Cheap; saves a manual sync after REST mutations.
  const refreshView = useCallback(async () => {
    try {
      const v = await pvpClient.getMatch(code);
      setView(v);
    } catch {
      /* ignore */
    }
  }, [code]);

  // Lobby-phase poll. WS lobby.state is authoritative when it arrives
  // but ingress timeouts and brief network blips can drop frames
  // silently — without a fallback, one player toggling ready never
  // shows up on the other player's screen. Poll only while we're in
  // the lobby (cheap; stops the moment the match transitions out).
  useEffect(() => {
    if (phase.kind !== "lobby") return;
    const t = setInterval(refreshView, 2500);
    return () => clearInterval(t);
  }, [phase.kind, refreshView]);

  useEffect(() => {
    let cancelled = false;
    const s = new PvPSocket(code);
    sockRef.current = s;
    const offFrame = s.onFrame((f) => handleFrame(f));
    const offStatus = s.onStatus((st) => setSocketStatus(st === "open" ? "open" : st === "closed" ? "closed" : "closed"));

    // Opponents arrive at /play/b/<code> via an invite link without
    // being seated yet — only the host is auto-seated on create.
    // Mint-WS-token rejects unseated callers with not_in_match, so
    // join first if needed, then open the socket.
    (async () => {
      try {
        if (initial && initial.you_are === "guest") {
          const joined = await pvpClient.join(code);
          if (cancelled) return;
          setView(joined);
        }
        if (cancelled) return;
        await s.connect();
      } catch (err: any) {
        if (!cancelled) {
          setPhase({ kind: "error", message: err?.message ?? "Failed to open match socket" });
        }
      }
    })();

    const ping = setInterval(() => s.sendPing(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(ping);
      offFrame();
      offStatus();
      s.close();
      sockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  function handleFrame(f: Frame) {
    switch (f.type) {
      case "lobby.state": {
        // The server-sent lobby snapshot is authoritative.
        const d = f.data as any;
        setView((prev) => prev ? { ...prev, match: { ...prev.match, status: d.status, format: d.format, target_score: d.target_score }, players: d.players.map((p: any) => ({
          user_id: p.user_id,
          display_name: p.display_name,
          avatar_url: null,
          seat: p.seat,
          ready: p.ready,
          joined_at: prev.players.find((q) => q.user_id === p.user_id)?.joined_at ?? new Date().toISOString(),
        })) } : prev);
        break;
      }
      case "match.countdown": {
        const d = f.data as { starts_at_ms: number };
        setPhase({ kind: "countdown", startsAtMs: d.starts_at_ms });
        break;
      }
      case "round.start": {
        const d = f.data as RoundStartData;
        setPhase({ kind: "reveal", round: d, countdownMs: MODE_REVEAL_MS });
        break;
      }
      case "round.end": {
        const d = f.data as RoundEndData;
        if (d.score) setScore(d.score);
        // Append to the per-round timeline; de-dupe by round_id in
        // case the WS re-delivers a frame after a reconnect.
        setRoundResults((prev) => prev.some((r) => r.round_id === d.round_id) ? prev : [...prev, d]);
        setPhase((p) => p.kind === "playing" || p.kind === "reveal"
          ? { kind: "round-end", result: d, round: p.kind === "playing" ? p.round : (p as any).round, nextAt: Date.now() + ROUND_END_HOLD_MS }
          : p);
        if (audioRef.current) {
          try { audioRef.current.pause(); } catch { /* */ }
        }
        break;
      }
      case "match.end": {
        const d = f.data as MatchEndData;
        if (d.final_score) setScore(d.final_score);
        setPhase({ kind: "ended", result: d, winner: d.winner_user_id ?? null });
        break;
      }
      case "player.disconnected": {
        const d = f.data as PlayerDisconnectData;
        if (d.user_id !== user.id) {
          setPhase((p) =>
            p.kind === "playing" || p.kind === "reveal" || p.kind === "round-end" || p.kind === "lobby"
              ? { kind: "disconnected", userID: d.user_id, graceExpiresAtMs: d.grace_expires_at_ms }
              : p,
          );
        }
        break;
      }
      case "player.reconnected": {
        setPhase((p) => p.kind === "disconnected" ? { kind: "lobby" } : p);
        // Force a REST refresh — the opponent rejoined, we want the
        // lobby state in sync.
        refreshView();
        break;
      }
    }
  }

  // Drive the 2-second mode-reveal countdown locally so the UI
  // updates every frame; the actual clip play_at_ms is anchored by
  // the server.
  useEffect(() => {
    if (phase.kind !== "reveal") return;
    if (phase.countdownMs <= 0) {
      // Start the in-match phase. Audio playback begins now.
      const r = phase.round;
      if (audioRef.current) {
        try {
          audioRef.current.src = r.clip_url;
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        } catch { /* */ }
      }
      setPhase({ kind: "playing", round: r, playedMs: 0 });
      return;
    }
    const t = setTimeout(() => {
      setPhase((p) => p.kind === "reveal" ? { ...p, countdownMs: Math.max(0, p.countdownMs - 100) } : p);
    }, 100);
    return () => clearTimeout(t);
  }, [phase]);

  // Tick the clip timer.
  const playingStartRef = useRef<number>(0);
  useEffect(() => {
    if (phase.kind !== "playing") return;
    playingStartRef.current = Date.now();
    const id = setInterval(() => {
      setPhase((p) => p.kind === "playing"
        ? { ...p, playedMs: Date.now() - playingStartRef.current }
        : p);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === "playing" ? (phase as any).round.round_id : null]);

  // Round-end → wait then either rely on next round.start, or fall
  // through to ended/error.
  useEffect(() => {
    if (phase.kind !== "round-end") return;
    const remaining = Math.max(0, phase.nextAt - Date.now());
    const t = setTimeout(() => {
      // The server will send round.start (or match.end) before this
      // fires in steady state. If not, we stay on the reveal card
      // and the next frame eventually moves us along.
    }, remaining);
    return () => clearTimeout(t);
  }, [phase]);

  // The lobby phase needs Ready / Leave / Cancel buttons.
  const meReady = useMemo(
    () => view?.players?.find((p) => p.user_id === user.id)?.ready ?? false,
    [view, user.id],
  );
  const opponent = useMemo(
    () => view?.players?.find((p) => p.user_id !== user.id) ?? null,
    [view, user.id],
  );

  const handleReady = async () => {
    try {
      const next = await pvpClient.ready(code, !meReady);
      setView(next);
    } catch (err: any) {
      setPhase({ kind: "error", message: err?.message ?? "Failed to toggle ready" });
    }
  };
  const handleLeave = async () => {
    try {
      await pvpClient.leave(code);
      router.push("/play");
    } catch (err: any) {
      setPhase({ kind: "error", message: err?.message ?? "Failed to leave" });
    }
  };
  const handleCancel = async () => {
    try {
      await pvpClient.cancel(code);
      router.push("/play");
    } catch (err: any) {
      setPhase({ kind: "error", message: err?.message ?? "Failed to cancel" });
    }
  };
  const handleRematch = async () => {
    try {
      const next = await pvpClient.rematch(code);
      router.push(`/play/b/${next.match.room_code}`);
    } catch (err: any) {
      setPhase({ kind: "error", message: err?.message ?? "Failed to rematch" });
    }
  };

  if (!view) {
    return (
      <Layout user={user} modQueueCount={modQueueCount} title="Match — Opening Wiki">
        <CenterMessage text="Match not found. Has the link expired?" />
      </Layout>
    );
  }

  return (
    <Layout user={user} modQueueCount={modQueueCount} title={`Battle ${view.match.room_code}`}>
      <Head><meta name="description" content="PvP battle." /></Head>
      <audio ref={audioRef} preload="auto" />
      <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", fontFamily: SOLO.sans }}>
        {phase.kind === "lobby" && (
          <LobbyView
            view={view}
            meReady={meReady}
            opponent={opponent}
            socketStatus={socketStatus}
            onReady={handleReady}
            onLeave={handleLeave}
            onCancel={handleCancel}
            isHost={view.you_are === "host"}
            inviteUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/play/b/${view.match.room_code}`}
          />
        )}
        {phase.kind === "countdown" && (
          <CountdownView startsAtMs={phase.startsAtMs} />
        )}
        {phase.kind === "reveal" && (
          <RevealView mode={phase.round.mode} countdownMs={phase.countdownMs} view={view} score={score} />
        )}
        {phase.kind === "playing" && (
          <PlayingView
            view={view}
            round={phase.round}
            playedMs={phase.playedMs}
            meID={user.id}
            score={score}
            onSubmit={(anime_id) => {
              sockRef.current?.submitAnswer(phase.round.round_id, anime_id, Date.now());
            }}
            onTyping={() => sockRef.current?.sendTyping()}
          />
        )}
        {phase.kind === "round-end" && (
          <RoundEndView result={phase.result} view={view} meID={user.id} />
        )}
        {phase.kind === "ended" && (
          <MatchEndView
            result={phase.result}
            view={view}
            meID={user.id}
            roundResults={roundResults}
            onRematch={handleRematch}
          />
        )}
        {phase.kind === "disconnected" && (
          <DisconnectOverlay graceExpiresAtMs={phase.graceExpiresAtMs} userID={phase.userID} view={view} />
        )}
        {phase.kind === "error" && (
          <CenterMessage text={phase.message} extra={<Link href="/play" style={{ color: SOLO.accent, fontFamily: SOLO.mono, fontSize: 13, textDecoration: "none" }}>back to play →</Link>} />
        )}
      </div>
    </Layout>
  );
}

// ── Subviews ────────────────────────────────────────────────────────

function CenterMessage({ text, extra }: { text: string; extra?: React.ReactNode }) {
  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
      <div style={{ color: SOLO.fg, fontSize: 18 }}>{text}</div>
      {extra}
    </div>
  );
}

function LobbyView({
  view, meReady, opponent, socketStatus, onReady, onLeave, onCancel, isHost, inviteUrl,
}: {
  view: PvPMatchView; meReady: boolean; opponent: any; socketStatus: string;
  onReady: () => void; onLeave: () => void; onCancel: () => void;
  isHost: boolean; inviteUrl: string;
}) {
  const me = view.players.find((p) => p.user_id === view.players.find((q) => q.seat === 1)?.user_id);
  const filled = view.players.length === 2 && opponent;
  const allReady = filled && view.players.every((p) => p.ready);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl); } catch { /* */ }
  };
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "32px 40px 48px" }}>
      <nav style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginBottom: 14, display: "flex", gap: 6 }}>
        <Link href="/play" style={{ color: SOLO.fg2, textDecoration: "none" }}>Play</Link>
        <span style={{ color: SOLO.fg4 }}>/</span>
        <span style={{ color: SOLO.fg2 }}>Lobby</span>
      </nav>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 32, paddingBottom: 24, borderBottom: `1px solid ${SOLO.line}` }}>
        <div>
          <Eyebrow color={filled ? SOLO.ok : SOLO.fg3} dotColor={filled ? SOLO.ok : SOLO.accent}>
            {filled ? "Lobby · 2 / 2" : "Lobby · open"}
          </Eyebrow>
          <h1 style={{ margin: "8px 0 0", fontWeight: 800, fontSize: 32, letterSpacing: "-0.025em", lineHeight: 1.05 }}>
            {filled ? <>Ready when you <span style={{ color: SOLO.accent }}>are.</span></> : <>Waiting for an <span style={{ color: SOLO.accent }}>opponent.</span></>}
          </h1>
          <p style={{ margin: "8px 0 0", color: SOLO.fg3, fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.04em", maxWidth: 520, lineHeight: 1.6 }}>
            {filled
              ? "Both players need to press ready. The match starts 3 seconds after the second ready."
              : "Share the link below — the match starts once they join and both of you press ready. The room stays open for 30 minutes."}
          </p>
        </div>
        <div style={{ textAlign: "right", fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.06em" }}>
          Room
          <span style={{ display: "block", fontSize: 18, color: SOLO.fg, fontWeight: 500, letterSpacing: "0.08em", marginTop: 4 }}>
            {view.match.room_code}
          </span>
        </div>
      </div>

      {/* VS panel */}
      <div style={{ marginTop: 32, display: "grid", gridTemplateColumns: "1fr 80px 1fr", gap: 0, alignItems: "stretch" }}>
        <PlayerCard
          player={view.players.find((p) => p.user_id !== opponent?.user_id) ?? view.players[0]}
          variant={isHost ? "you" : "opponent"}
          label={isHost ? "You · host" : "Host"}
          ready={view.players.find((p) => p.seat === 1)?.ready ?? false}
        />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: SOLO.mono, fontWeight: 600, fontSize: 20, color: SOLO.fg3, letterSpacing: "0.14em", gap: 14 }}>
          <div style={{ flex: 1, width: 1, background: `linear-gradient(180deg, transparent 0%, ${SOLO.line2} 50%, transparent 100%)` }} />
          <div style={{ padding: "8px 0" }}>VS</div>
          <div style={{ flex: 1, width: 1, background: `linear-gradient(180deg, transparent 0%, ${SOLO.line2} 50%, transparent 100%)` }} />
        </div>
        {opponent ? (
          <PlayerCard
            player={opponent}
            variant={isHost ? "opponent" : "you"}
            label={isHost ? "Opponent" : "You"}
            ready={opponent.ready}
          />
        ) : (
          <EmptySlot />
        )}
      </div>

      {/* Invite */}
      {!filled && (
        <div style={{
          marginTop: 32, background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 12,
          padding: 28, display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center",
        }}>
          <h3 style={{ margin: 0, fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: SOLO.fg3, fontWeight: 500, display: "inline-flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: SOLO.warn, boxShadow: `0 0 10px ${SOLO.warn}` }} />
            Share the invite
          </h3>
          <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em", color: SOLO.fg }}>
            Anyone with this link can join
          </div>
          <div style={{ width: "100%", maxWidth: 560 }}>
            <div style={{ display: "flex", alignItems: "stretch", border: `1px solid ${SOLO.line2}`, borderRadius: 7, background: SOLO.bg, overflow: "hidden" }}>
              <span style={{ flex: 1, padding: "11px 14px", fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {inviteUrl}
              </span>
              <button onClick={copyInvite} style={{
                padding: "0 16px", background: SOLO.bg3, color: SOLO.fg, fontFamily: SOLO.mono, fontSize: 11,
                letterSpacing: "0.08em", textTransform: "uppercase", border: 0, borderLeft: `1px solid ${SOLO.line2}`, cursor: "pointer",
              }}>Copy link</button>
            </div>
          </div>
        </div>
      )}

      {filled && (
        <div style={{
          marginTop: 28, background: `linear-gradient(90deg, rgba(125,211,143,.06) 0%, rgba(167,139,250,.06) 100%)`,
          border: `1px solid rgba(125,211,143,.4)`, borderRadius: 12, padding: "22px 28px",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 20,
        }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <Eyebrow color={SOLO.ok} dotColor={SOLO.ok}>
              {meReady && opponent?.ready ? "Both ready · starting soon" : meReady ? "Waiting on opponent" : "Press ready when you are"}
            </Eyebrow>
            <h4 style={{ margin: 0, fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em" }}>
              Match starts 3s after the second ready.
            </h4>
            <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>
              First to {view.match.target_score} · audio · top 1,000 pool
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onLeave} style={lobbyBtn(SOLO.fg2, "transparent")}>Leave</button>
            <button onClick={onReady} style={lobbyBtn(meReady ? SOLO.fg : SOLO.bg, meReady ? SOLO.bg3 : SOLO.accent, !meReady)}>
              {meReady ? "Unready" : "✓ Ready"}
            </button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 28, display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 24, borderTop: `1px solid ${SOLO.line}` }}>
        <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>
          Socket · <span style={{ color: socketStatus === "open" ? SOLO.ok : SOLO.warn }}>● {socketStatus}</span>
        </span>
        {isHost && !filled && (
          <button onClick={onCancel} style={lobbyBtn(SOLO.danger, "transparent")}>Cancel lobby</button>
        )}
      </div>
    </div>
  );
}

function lobbyBtn(color: string, bg: string, prim?: boolean): React.CSSProperties {
  return {
    background: bg, color, border: `1px solid ${prim ? SOLO.accent : SOLO.line2}`,
    padding: "10px 16px", borderRadius: 7, fontSize: 13, cursor: "pointer", fontFamily: SOLO.sans,
    fontWeight: prim ? 600 : 400, boxShadow: prim ? `0 0 30px ${SOLO.accent}55` : "none",
  };
}

function PlayerCard({ player, variant, label, ready }: { player: any; variant: "you" | "opponent"; label: string; ready: boolean }) {
  const color = variant === "you" ? SOLO.accent : SOLO.line2;
  return (
    <div style={{
      background: SOLO.bg2, border: `1px solid ${ready ? "rgba(125,211,143,.5)" : color}`, borderRadius: 14, padding: 28,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", minHeight: 340,
    }}>
      <Eyebrow color={ready ? SOLO.ok : variant === "you" ? SOLO.accent : SOLO.fg3} dotColor={ready ? SOLO.ok : variant === "you" ? SOLO.accent : SOLO.fg3}>
        {label}{ready ? " · ready" : ""}
      </Eyebrow>
      <div style={{
        width: 84, height: 84, borderRadius: "50%", background: SOLO.bg3,
        border: `2px solid ${ready ? SOLO.ok : color}`, display: "grid", placeItems: "center",
        fontWeight: 700, fontSize: 32, color: variant === "you" ? SOLO.accent : SOLO.fg,
      }}>
        {(player?.display_name?.[0] ?? "?").toUpperCase()}
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 20, letterSpacing: "-0.02em", color: SOLO.fg }}>{player?.display_name ?? "—"}</div>
      </div>
      <div style={{ marginTop: "auto", fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 4, border: `1px solid ${SOLO.line2}`, color: ready ? SOLO.ok : SOLO.fg3 }}>
        {ready ? "✓ Ready" : "In lobby"}
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div style={{
      background: SOLO.bg2, border: `1px dashed ${SOLO.line2}`, borderRadius: 14, padding: 28,
      display: "flex", flexDirection: "column", alignItems: "center", gap: 16, textAlign: "center", minHeight: 340,
    }}>
      <Eyebrow color={SOLO.fg3} dotColor={SOLO.fg3}>Opponent · empty</Eyebrow>
      <div style={{
        width: 84, height: 84, borderRadius: "50%", background: "transparent",
        border: `2px dashed ${SOLO.line2}`, display: "grid", placeItems: "center",
        fontWeight: 700, fontSize: 32, color: SOLO.fg4,
      }}>?</div>
      <div>
        <div style={{ fontWeight: 700, fontSize: 20, color: SOLO.fg3 }}>Waiting…</div>
        <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginTop: 2 }}>
          Share the invite link to fill this slot
        </div>
      </div>
    </div>
  );
}

function CountdownView({ startsAtMs }: { startsAtMs: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const seconds = Math.max(0, Math.ceil((startsAtMs - now) / 1000));
  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 24 }}>
      <Eyebrow>Starting in</Eyebrow>
      <div style={{ fontFamily: SOLO.mono, fontSize: 200, fontWeight: 500, color: SOLO.accent, lineHeight: 0.9, textShadow: `0 0 60px ${SOLO.accent}55` }}>{seconds}</div>
    </div>
  );
}

function RevealView({ mode, countdownMs, view, score }: { mode: string; countdownMs: number; view: PvPMatchView; score: Record<string, number> }) {
  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <MatchHud view={view} scoreOverride={score} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "80px 40px" }}>
        <Eyebrow>Next round · listen carefully</Eyebrow>
        <h1 style={{ margin: "20px 0 0", fontWeight: 900, fontSize: 160, letterSpacing: "-0.06em", lineHeight: 0.9, color: SOLO.accent, textShadow: `0 0 60px ${SOLO.accent}55` }}>
          {mode.toUpperCase()}
        </h1>
        <p style={{ marginTop: 24, color: SOLO.fg2, fontSize: 18, maxWidth: 520, lineHeight: 1.45 }}>
          No video, no lyrics. Just the song. Guess the anime as fast as you can — first correct wins the round.
        </p>
        <div style={{ marginTop: 60, fontFamily: SOLO.mono, fontWeight: 500, fontSize: 120, color: SOLO.fg, letterSpacing: "-0.04em" }}>
          {Math.ceil(countdownMs / 1000)}
        </div>
        <div style={{ marginTop: 8, fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: SOLO.fg4 }}>
          Seconds until clip
        </div>
      </div>
    </div>
  );
}

function MatchHud({ view, scoreOverride }: { view: PvPMatchView; scoreOverride?: Record<string, number> }) {
  const players = view.players;
  const host = players.find((p) => p.seat === 1);
  const opp = players.find((p) => p.seat === 2);
  const hostScore = scoreOverride?.[host?.user_id ?? ""] ?? 0;
  const oppScore = scoreOverride?.[opp?.user_id ?? ""] ?? 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "16px 28px", background: "rgba(12,10,20,.92)", borderBottom: `1px solid ${SOLO.line}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: SOLO.bg3, border: `2px solid ${SOLO.accent}`, color: SOLO.accent, display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16 }}>
          {(host?.display_name?.[0] ?? "?").toUpperCase()}
        </div>
        <div style={{ fontWeight: 600, fontSize: 14, color: SOLO.fg }}>{host?.display_name ?? "—"}</div>
      </div>
      <div style={{ width: 1, height: 36, background: SOLO.line2 }} />
      <div style={{ fontFamily: SOLO.mono, fontWeight: 500, fontSize: 34, color: SOLO.accent, letterSpacing: "-0.04em" }}>{hostScore}</div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: "0 24px" }}>
        <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.14em", textTransform: "uppercase" }}>Race</div>
        <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg2, letterSpacing: "0.06em" }}>first to <span style={{ color: SOLO.fg }}>{view.match.target_score}</span></div>
      </div>
      <div style={{ fontFamily: SOLO.mono, fontWeight: 500, fontSize: 34, color: SOLO.line2, letterSpacing: "-0.04em" }}>{oppScore}</div>
      <div style={{ width: 1, height: 36, background: SOLO.line2 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, justifyContent: "flex-end" }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: SOLO.fg, textAlign: "right" }}>{opp?.display_name ?? "—"}</div>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: SOLO.bg3, border: `2px solid #6aa9ff`, color: "#6aa9ff", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 16 }}>
          {(opp?.display_name?.[0] ?? "?").toUpperCase()}
        </div>
      </div>
    </div>
  );
}

function PlayingView({ view, round, playedMs, meID, score, onSubmit, onTyping }: {
  view: PvPMatchView; round: RoundStartData; playedMs: number; meID: string;
  score: Record<string, number>;
  onSubmit: (anime_id: string) => void; onTyping: () => void;
}) {
  const [query, setQuery] = useState("");
  // Anime autocomplete — scoring is anime-based now, so the user
  // picks an anime and any of its openings counts as correct.
  const [suggestions, setSuggestions] = useState<Array<{ id: string; title: string; year: number | null; cover: string | null }>>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const queryRef = useRef(query);
  queryRef.current = query;

  useEffect(() => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    onTyping();
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
      } catch { /* */ }
    }, 120);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); const pick = suggestions[activeIdx]; if (pick) onSubmit(pick.id); }
    else if (e.key === "Escape") { setQuery(""); setSuggestions([]); }
  };

  const pct = Math.min(1, playedMs / round.clip_duration_ms);
  const secsLeft = Math.max(0, (round.clip_duration_ms - playedMs) / 1000);

  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <MatchHud view={view} scoreOverride={score} />
      <div style={{ height: 3, background: SOLO.line, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, right: `${(1 - pct) * 100}%`, background: secsLeft < 5 ? SOLO.danger : SOLO.accent, boxShadow: `0 0 14px ${secsLeft < 5 ? SOLO.danger : SOLO.accent}`, transition: "right .15s linear" }} />
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 40px 30px", gap: 24 }}>
        <div style={{ width: "100%", maxWidth: 720, aspectRatio: "16 / 9", background: `radial-gradient(ellipse at center, #1d1929 0%, #0c0a14 80%)`, borderRadius: 10, border: `1px solid ${SOLO.line2}`, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: 14, left: 14, fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, background: "rgba(0,0,0,.4)", padding: "5px 9px", borderRadius: 4, zIndex: 1 }}>
            ● Audio only · {secsLeft.toFixed(1)}s left
          </div>
          <div style={{ width: "100%" }}>
            <Waveform played={pct} />
          </div>
        </div>
        <div style={{ position: "relative", width: "100%", maxWidth: 720 }}>
          {suggestions.length > 0 && (
            <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, borderRadius: 10, marginBottom: 8, overflow: "hidden", boxShadow: "0 -20px 50px -10px rgba(0,0,0,0.5)" }}>
              {suggestions.map((s, i) => (
                <div key={s.id} onMouseEnter={() => setActiveIdx(i)} onClick={() => onSubmit(s.id)} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                  background: i === activeIdx ? SOLO.bg3 : "transparent",
                  borderLeft: i === activeIdx ? `2px solid ${SOLO.accent}` : "2px solid transparent",
                  cursor: "pointer",
                }}>
                  <div style={{
                    width: 38, height: 52, borderRadius: 4,
                    border: `1px solid ${SOLO.line}`, flexShrink: 0, overflow: "hidden",
                    background: s.cover ? "transparent" : SOLO.bg2,
                    backgroundImage: s.cover ? "none" : `repeating-linear-gradient(135deg, ${SOLO.bg3} 0 6px, ${SOLO.bg2} 6px 7px)`,
                  }}>
                    {s.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.cover} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: SOLO.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                    <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginTop: 2 }}>{s.year ?? "—"}</div>
                  </div>
                  {i === activeIdx && <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, border: `1px solid ${SOLO.line2}`, padding: "2px 6px", borderRadius: 3 }}>↵</span>}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 14, background: SOLO.bg2, border: `1.5px solid ${SOLO.accent}`, borderRadius: 10, padding: "16px 20px", boxShadow: `0 0 0 4px ${SOLO.accent}11` }}>
            <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.accent, letterSpacing: "0.16em", textTransform: "uppercase" }}>Anime</span>
            <input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onKey}
              placeholder="Type the anime title…"
              style={{ flex: 1, background: "transparent", border: 0, outline: 0, color: SOLO.fg, fontSize: 18, fontWeight: 500, fontFamily: SOLO.sans }}
            />
            <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, border: `1px solid ${SOLO.line2}`, padding: "3px 8px", borderRadius: 4 }}>↵ Enter</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoundEndView({ result, view, meID }: { result: RoundEndData; view: PvPMatchView; meID: string }) {
  const winner = result.winner_user_id;
  const youWon = winner === meID;
  const noScore = result.no_score;
  const accent = noScore ? SOLO.warn : youWon ? SOLO.ok : SOLO.danger;
  const headline = noScore ? "Tough one." : youWon ? "+1 round." : "−1 round.";
  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column" }}>
      <MatchHud view={view} scoreOverride={result.score} />
      <div style={{ flex: 1, padding: "36px 40px 28px", display: "flex", flexDirection: "column", gap: 22, justifyContent: "center" }}>
        <div>
          <Eyebrow color={accent} dotColor={accent}>
            {noScore ? "No score · redraw" : youWon ? "You got it" : "Opponent got it"}
          </Eyebrow>
          <h2 style={{ margin: "10px 0 4px", fontWeight: 800, fontSize: 54, letterSpacing: "-0.04em", color: accent }}>{headline}</h2>
          <div style={{ fontFamily: SOLO.mono, fontSize: 13, color: SOLO.fg3 }}>
            Score · <span style={{ color: SOLO.fg }}>{result.score[Object.keys(result.score)[0]]} – {result.score[Object.keys(result.score)[1]]}</span>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "22px 24px", background: SOLO.bg2, border: `1px solid ${accent}33`, borderRadius: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.accent, letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 6 }}>
              Round · the answer
            </div>
            <h3 style={{ margin: "0 0 4px", fontWeight: 700, fontSize: 24, letterSpacing: "-0.025em" }}>{result.correct_opening.anime_name}</h3>
            <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3 }}>
              {result.correct_opening.title}{result.correct_opening.singer_name ? ` · ${result.correct_opening.singer_name}` : ""}{result.correct_opening.year ? ` · ${result.correct_opening.year}` : ""}
            </div>
            {result.correct_opening.avg_rating ? (
              <div style={{ marginTop: 8, fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg2 }}>
                <span style={{ color: SOLO.warn, fontWeight: 500 }}>★ {result.correct_opening.avg_rating.toFixed(1)}</span> · {result.correct_opening.rating_count ?? 0} ratings
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function MatchEndView({ result, view, meID, roundResults, onRematch }: { result: MatchEndData; view: PvPMatchView; meID: string; roundResults: RoundEndData[]; onRematch: () => void }) {
  const youWon = result.winner_user_id === meID;
  const me = view.players.find((p) => p.user_id === meID);
  const opp = view.players.find((p) => p.user_id !== meID);
  const myScore = result.final_score[meID] ?? 0;
  const oppScore = opp ? (result.final_score[opp.user_id] ?? 0) : 0;
  // Prefer the client-side timeline (collected from round.end frames
  // during the match) since the backend's match.end frame doesn't
  // include a rounds list yet.
  const rounds = roundResults;
  return (
    <div style={{ maxWidth: 1120, margin: "0 auto", padding: "48px 40px 64px" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 28, paddingBottom: 28, borderBottom: `1px solid ${SOLO.line}` }}>
        <div>
          <Eyebrow color={youWon ? SOLO.ok : SOLO.danger} dotColor={youWon ? SOLO.ok : SOLO.danger}>
            {youWon ? "Match · won" : "Match · lost"}{result.by_forfeit ? " · forfeit" : ""}
          </Eyebrow>
          <h1 style={{ margin: "14px 0 0", fontWeight: 900, fontSize: 80, letterSpacing: "-0.05em", lineHeight: 0.95 }}>
            {youWon ? <>You took the <span style={{ color: SOLO.accent }}>match.</span></> : <>Good run.</>}
          </h1>
          {opp && (
            <p style={{ marginTop: 14, color: SOLO.fg2, fontSize: 15, maxWidth: 520 }}>
              {myScore}–{oppScore} {youWon ? "over" : "against"} <span style={{ color: SOLO.accent, fontWeight: 600 }}>{opp.display_name}</span>{rounds.length > 0 ? ` · ${rounds.length} rounds.` : "."}
            </p>
          )}
        </div>
        <div style={{ fontFamily: SOLO.mono, fontWeight: 500, fontSize: 80, letterSpacing: "-0.04em", display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ color: SOLO.accent }}>{myScore}</span>
          <span style={{ color: SOLO.fg4, fontSize: 50 }}>–</span>
          <span style={{ color: SOLO.fg3 }}>{oppScore}</span>
        </div>
      </div>

      {/* Round timeline — one card per round, colored by outcome. */}
      {rounds.length > 0 && (
      <div style={{ marginTop: 32, padding: "22px 24px", background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14, fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.14em", textTransform: "uppercase" }}>
          <span>Round-by-round</span>
          <span>{rounds.length} {rounds.length === 1 ? "round" : "rounds"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rounds.map((r, idx) => {
            const youW = r.winner_user_id === meID;
            const oppW = !!r.winner_user_id && !youW;
            const ns = r.no_score;
            const palette = ns
              ? { bg: SOLO.bg3, border: SOLO.line2, accent: SOLO.fg4, label: "No score" }
              : youW
                ? { bg: `${SOLO.accent}1a`, border: `${SOLO.accent}55`, accent: SOLO.accent, label: "You" }
                : { bg: "rgba(106,169,255,.12)", border: "rgba(106,169,255,.4)", accent: "#6aa9ff", label: opp?.display_name ?? "Opponent" };
            const myResp = r.responses?.[meID];
            const oppResp = opp ? r.responses?.[opp.user_id] : undefined;
            const winnerResp = youW ? myResp : oppW ? oppResp : undefined;
            const respMs = winnerResp?.response_ms;
            const op = r.correct_opening;
            return (
              <div key={r.round_id} style={{
                display: "grid", gridTemplateColumns: "44px 1fr auto", alignItems: "center", gap: 16,
                padding: "14px 16px", borderRadius: 8,
                background: palette.bg, border: `1px solid ${palette.border}`,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 6,
                  display: "grid", placeItems: "center",
                  background: ns ? SOLO.bg2 : `${palette.accent}26`,
                  border: `1px solid ${palette.border}`,
                  color: palette.accent,
                  fontFamily: SOLO.mono, fontWeight: 700, fontSize: 14,
                }}>
                  {idx + 1}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15, color: SOLO.fg, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {op?.title ?? "—"}
                  </div>
                  <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {op?.anime_name ?? "—"}
                    {op?.singer_name ? <span style={{ color: SOLO.fg4 }}> · {op.singer_name}</span> : null}
                    {op?.year ? <span style={{ color: SOLO.fg4 }}> · {op.year}</span> : null}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                  <div style={{ fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: palette.accent, fontWeight: 600 }}>
                    {palette.label}
                  </div>
                  {!ns && typeof respMs === "number" && (
                    <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg2 }}>
                      {(respMs / 1000).toFixed(2)}s
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      )}

      <div style={{ marginTop: 32, paddingTop: 18, borderTop: `1px solid ${SOLO.line}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
        <Link href="/play" style={{ ...lobbyBtn(SOLO.fg2, "transparent"), textDecoration: "none" }}>Back to play</Link>
        <button onClick={onRematch} style={lobbyBtn(SOLO.bg, SOLO.accent, true)}>Rematch · same rules ↻</button>
      </div>
    </div>
  );
}

function DisconnectOverlay({ graceExpiresAtMs, userID, view }: { graceExpiresAtMs: number; userID: string; view: PvPMatchView }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);
  const remaining = Math.max(0, Math.floor((graceExpiresAtMs - now) / 1000));
  const opp = view.players.find((p) => p.user_id === userID);
  return (
    <div style={{ minHeight: "calc(100vh - 60px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ background: SOLO.bg2, border: `1px solid ${SOLO.warn}`, borderRadius: 14, padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, textAlign: "center", maxWidth: 440, boxShadow: `0 0 60px ${SOLO.warn}26` }}>
        <Eyebrow color={SOLO.warn} dotColor={SOLO.warn}>Connection lost · opponent</Eyebrow>
        <h3 style={{ margin: 0, fontWeight: 700, fontSize: 22 }}>
          {opp?.display_name ?? "Opponent"} is reconnecting.
        </h3>
        <p style={{ margin: 0, color: SOLO.fg2, fontSize: 14 }}>
          The match is paused. If they don&apos;t return in time, the match is awarded to you by forfeit.
        </p>
        <div style={{ fontFamily: SOLO.mono, fontWeight: 500, fontSize: 48, color: SOLO.warn, lineHeight: 1, textShadow: `0 0 20px ${SOLO.warn}55` }}>
          0:{String(remaining).padStart(2, "0")}
        </div>
      </div>
    </div>
  );
}
