import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState, useCallback } from "react";
import type { GetServerSideProps } from "next";

import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow } from "@/components/solo/atoms";
import {
  partyClient,
  PartySocket,
  type PartyRoomView,
  type LobbyStateData,
  type RoundStartData,
  type RoundEndData,
  type MatchEndData,
  type Standing,
  type Frame,
} from "@/lib/party";
import type { User } from "@/lib/types";

// --- Types ---

type Phase =
  | "lobby"
  | "countdown"
  | "playing"
  | "round-end"
  | "ended"
  | "error"
  | "not-found";

interface Props {
  user: User | null;
  modQueueCount: number;
  initialView: PartyRoomView | null;
  code: string;
}

// --- SSR ---

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const code = String(ctx.params?.code ?? "");
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: `/login?next=/play/p/${encodeURIComponent(code)}`, permanent: false } };
  }
  let initialView: PartyRoomView | null = null;
  try {
    const res = await fetch(
      `${process.env.BACKEND_URL ?? "http://localhost:8080"}/api/v1/play/party/rooms/${encodeURIComponent(code)}`,
      { headers: { cookie: ctx.req.headers.cookie ?? "" } },
    );
    if (res.ok) {
      const body = await res.json();
      initialView = body.data as PartyRoomView;
    }
  } catch {
    /* non-fatal */
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount, initialView, code } };
};

// --- Main component ---

export default function PartyRoom({ user, modQueueCount, initialView, code }: Props) {
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>(
    initialView ? (initialView.room.status === "ended" ? "ended" : "lobby") : "not-found",
  );
  const [view, setView] = useState<PartyRoomView | null>(initialView);
  const [lobbyData, setLobbyData] = useState<LobbyStateData | null>(null);
  const [currentRound, setCurrentRound] = useState<RoundStartData | null>(null);
  const [roundEndData, setRoundEndData] = useState<RoundEndData | null>(null);
  const [matchEndData, setMatchEndData] = useState<MatchEndData | null>(null);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [myScore, setMyScore] = useState(0);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [countdownMs, setCountdownMs] = useState(3000);
  const [nextRoundMs, setNextRoundMs] = useState(5000);
  const [wsStatus, setWsStatus] = useState<"connecting" | "open" | "closed">("connecting");
  const [error, setError] = useState<string | null>(null);

  // Autocomplete state
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Array<{ id: string; title: string; anime_name: string }>>([]);
  const [myAnswer, setMyAnswer] = useState<{ status: "answered" | "locked" | "timeout" | null; points: number }>({ status: null, points: 0 });
  const [answeredCount, setAnsweredCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);

  const socketRef = useRef<PartySocket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const clockOffsetRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const serverNow = () => Date.now() + clockOffsetRef.current;

  // Join room if not already in it.
  useEffect(() => {
    if (!user || !view) return;
    const isInRoom = view.players.some((p) => p.user_id === user.id);
    if (isInRoom) return;
    if (view.room.status !== "lobby") return;
    partyClient.join(code).then((v) => setView(v)).catch(() => {});
  }, []);

  // Connect WebSocket.
  useEffect(() => {
    if (!user || phase === "not-found" || phase === "error") return;
    const sock = new PartySocket(code);
    socketRef.current = sock;

    const off = sock.onFrame(handleFrame);
    const offStatus = sock.onStatus((s) => {
      setWsStatus(s === "open" ? "open" : "closed");
    });
    setWsStatus("connecting");
    sock.connect().catch(() => {});

    // Ping every 10s for clock sync.
    const pingInterval = setInterval(() => sock.sendPing(), 10000);

    return () => {
      off();
      offStatus();
      clearInterval(pingInterval);
      sock.close();
    };
  }, [user, code]);

  const handleFrame = useCallback((f: Frame) => {
    if (f.server_now_ms) {
      clockOffsetRef.current = f.server_now_ms - Date.now();
    }

    switch (f.type) {
      case "lobby.state": {
        const d = f.data as LobbyStateData;
        setLobbyData(d);
        if (d.status === "lobby") setPhase("lobby");
        break;
      }
      case "match.countdown": {
        const d = f.data as { starts_at_ms: number };
        setPhase("countdown");
        const remaining = d.starts_at_ms - serverNow();
        setCountdownMs(Math.max(0, remaining));
        break;
      }
      case "round.start":
      case "round.snapshot": {
        const d = f.data as RoundStartData;
        setCurrentRound(d);
        setAnsweredCount(d.answered_count);
        setTotalPlayers(d.total_players);
        setMyAnswer({ status: null, points: 0 });
        setQuery("");
        setSuggestions([]);
        setRoundEndData(null);
        if (f.type === "round.start") {
          setPhase("playing");
        }
        // Schedule audio playback.
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.src = d.clip_url;
        } else {
          audioRef.current = new Audio(d.clip_url);
        }
        const nowMs = serverNow();
        const playAt = d.play_at_ms;
        const delay = playAt - nowMs;
        if (delay > 0) {
          setTimeout(() => {
            audioRef.current?.play().catch(() => {});
          }, delay);
        } else {
          // Reconnect mid-round: seek audio.
          const seekMs = nowMs - playAt;
          audioRef.current.currentTime = seekMs / 1000;
          audioRef.current.play().catch(() => {});
        }
        setTimeout(() => inputRef.current?.focus(), 50);
        break;
      }
      case "round.end": {
        const d = f.data as RoundEndData;
        setRoundEndData(d);
        setPhase("round-end");
        setStandings(d.standings);
        audioRef.current?.pause();
        // Update my score from standings.
        if (user) {
          const mine = d.standings.find((s) => s.user_id === user.id);
          if (mine) {
            setMyScore(mine.score);
            setMyRank(mine.rank);
          }
          const myResult = d.responses[user.id];
          if (myResult) {
            setMyAnswer({ status: myResult.status as any, points: myResult.points_earned });
          }
        }
        // Countdown to next round.
        const gap = 5000;
        setNextRoundMs(gap);
        const ticker = setInterval(() => {
          setNextRoundMs((prev) => Math.max(0, prev - 100));
        }, 100);
        setTimeout(() => clearInterval(ticker), gap + 200);
        break;
      }
      case "match.end": {
        const d = f.data as MatchEndData;
        setMatchEndData(d);
        setStandings(d.standings);
        setPhase("ended");
        audioRef.current?.pause();
        break;
      }
      case "server.pong": {
        const d = f.data as { client_sent_ms: number; server_recv_ms: number; server_sent_ms: number };
        const rtt = Date.now() - d.client_sent_ms;
        clockOffsetRef.current = d.server_sent_ms + rtt / 2 - Date.now();
        break;
      }
    }
  }, [user]);

  // Autocomplete fetch.
  useEffect(() => {
    if (query.length < 2) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    fetch(`/api/anime/search?q=${encodeURIComponent(query)}&limit=6`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((b) => setSuggestions(b.data ?? []))
      .catch(() => {});
    return () => ctrl.abort();
  }, [query]);

  const submitAnswer = (animeId: string) => {
    if (!currentRound || myAnswer.status !== null) return;
    const now = Date.now();
    socketRef.current?.submitAnswer(currentRound.round_id, animeId, now);
    setMyAnswer({ status: "answered", points: 0 });
    setQuery("");
    setSuggestions([]);
    audioRef.current?.pause();
  };

  const startParty = async () => {
    try {
      await partyClient.start(code);
    } catch (e: any) {
      setError(e?.message ?? "Failed to start");
    }
  };

  const leaveRoom = async () => {
    await partyClient.leave(code).catch(() => {});
    router.push("/play");
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href).catch(() => {});
  };

  const isHost = user && view && view.room.host_user_id === user.id;
  const roomPlayers = lobbyData?.players ?? view?.players ?? [];

  // --- Render ---

  if (phase === "not-found") {
    return (
      <Layout user={user} modQueueCount={modQueueCount} title="Room not found — Opening Wiki">
        <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <p style={{ color: SOLO.fg2, marginBottom: 16 }}>Room not found or has expired.</p>
            <Link href="/play/party/new" style={{ color: SOLO.accent }}>Open a new room</Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user} modQueueCount={modQueueCount} title={`Party ${code} — Opening Wiki`}>
      <Head><meta name="description" content="Party mode — guess the opening together" /></Head>
      <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", fontFamily: SOLO.sans }}>

        {/* HUD — shown during playing / round-end */}
        {(phase === "playing" || phase === "round-end") && currentRound && (
          <div style={{
            position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
            background: SOLO.bg2, borderBottom: `1px solid ${SOLO.line}`,
            display: "flex", alignItems: "center", padding: "0 24px", height: 52, gap: 20,
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>Round</span>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{currentRound.round_no}</span>
              <span style={{ color: SOLO.fg4, fontFamily: SOLO.mono, fontSize: 11 }}>/ {currentRound.rounds_total}</span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3 }}>
              <span style={{ color: SOLO.ok, fontWeight: 600 }}>{answeredCount}</span>
              <span style={{ color: SOLO.fg4 }}>/{totalPlayers} answered</span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              {myRank !== null && (
                <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>
                  #{myRank}
                </span>
              )}
              <span style={{ fontWeight: 700, fontSize: 16, color: SOLO.accent }}>{myScore}</span>
              <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>pts</span>
            </div>
          </div>
        )}

        {/* ===== LOBBY ===== */}
        {phase === "lobby" && (
          <div style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 40px 48px" }}>
            <nav style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em", marginBottom: 14, display: "flex", gap: 6 }}>
              <Link href="/play" style={{ color: SOLO.fg2, textDecoration: "none" }}>Play</Link>
              <span style={{ color: SOLO.fg4 }}>/</span>
              <span>Party lobby</span>
            </nav>
            <Eyebrow>Party lobby.</Eyebrow>
            <h1 style={{ margin: "10px 0 4px", fontWeight: 800, fontSize: 40, letterSpacing: "-0.04em", lineHeight: 1 }}>
              Unlimited room. <span style={{ color: SOLO.accent }}>Share the link.</span>
            </h1>
            <p style={{ margin: "0 0 24px", color: SOLO.fg2, fontSize: 14, lineHeight: 1.55 }}>
              Everyone races on the same clip when the host starts. Fastest correct answer each round scores the most points.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 24 }}>
              {/* Players grid */}
              <div>
                <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    {roomPlayers.length} joined
                  </span>
                  {wsStatus !== "open" && (
                    <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4 }}>connecting…</span>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
                  {roomPlayers.map((p) => {
                    const isMe = user && p.user_id === user.id;
                    const isRoomHost = lobbyData ? p.user_id === lobbyData.host_user_id : view && p.user_id === view.room.host_user_id;
                    return (
                      <div key={p.user_id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{
                          width: 48, height: 48, borderRadius: "50%",
                          background: isMe ? SOLO.accent : SOLO.bg3,
                          border: `2px solid ${isRoomHost ? SOLO.warn : isMe ? SOLO.accent : SOLO.line}`,
                          display: "grid", placeItems: "center",
                          overflow: "hidden", flexShrink: 0,
                        }}>
                          {p.avatar_url ? (
                            <img src={p.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <span style={{ fontFamily: SOLO.mono, fontSize: 16, color: isMe ? SOLO.bg : SOLO.fg2 }}>
                              {p.display_name.charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: isMe ? SOLO.accent : SOLO.fg2, letterSpacing: "0.04em", maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {p.display_name}
                          </div>
                          {isRoomHost && <div style={{ fontFamily: SOLO.mono, fontSize: 9, color: SOLO.warn, letterSpacing: "0.06em" }}>host</div>}
                          {isMe && !isRoomHost && <div style={{ fontFamily: SOLO.mono, fontSize: 9, color: SOLO.accent, letterSpacing: "0.06em" }}>you</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Room rules */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
                  {[
                    { k: "Rounds", v: String(lobbyData?.rounds_total ?? view?.room.rounds_total ?? 10) },
                    { k: "Mode", v: "Audio" },
                    { k: "Pool", v: "Top 1k" },
                    { k: "Players", v: "No cap" },
                  ].map((r) => (
                    <div key={r.k} style={{
                      background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 8, padding: "10px 12px",
                    }}>
                      <div style={{ fontFamily: SOLO.mono, fontSize: 9, color: SOLO.fg4, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{r.k}</div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{r.v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sidebar */}
              <aside style={{
                position: "sticky", top: 80, background: SOLO.bg2, border: `1px solid ${SOLO.line2}`,
                borderRadius: 10, padding: 20, alignSelf: "start",
                display: "flex", flexDirection: "column", gap: 12,
              }}>
                <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em" }}>Room code</div>
                <div style={{
                  fontFamily: SOLO.mono, fontWeight: 700, fontSize: 22, letterSpacing: "0.1em",
                  color: SOLO.fg, padding: "10px 14px", background: SOLO.bg3, borderRadius: 8, textAlign: "center",
                }}>
                  {code}
                </div>
                <button
                  onClick={copyLink}
                  style={{
                    background: SOLO.bg3, border: `1px solid ${SOLO.line2}`, borderRadius: 7,
                    padding: "10px 14px", color: SOLO.fg2, fontSize: 13, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  Copy invite link
                </button>
                {error && (
                  <div style={{ fontSize: 12, color: SOLO.danger, padding: "8px 10px", background: "rgba(239,104,104,.08)", borderRadius: 6 }}>
                    {error}
                  </div>
                )}
                {isHost ? (
                  <button
                    onClick={startParty}
                    disabled={roomPlayers.length < 1}
                    style={{
                      background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
                      padding: "14px 16px", fontWeight: 700, fontSize: 15, cursor: "pointer",
                      boxShadow: `0 0 24px ${SOLO.accent}55`,
                    }}
                  >
                    Start party · {roomPlayers.length} {roomPlayers.length === 1 ? "player" : "players"}
                  </button>
                ) : (
                  <div style={{ textAlign: "center", fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, padding: "10px 0" }}>
                    Waiting for host to start…
                  </div>
                )}
                <button
                  onClick={leaveRoom}
                  style={{
                    background: "transparent", border: "none", color: SOLO.fg3,
                    padding: "8px 0", fontSize: 13, cursor: "pointer", textAlign: "center",
                  }}
                >
                  Leave room
                </button>
              </aside>
            </div>
          </div>
        )}

        {/* ===== COUNTDOWN ===== */}
        {phase === "countdown" && (
          <div style={{
            minHeight: "calc(100vh - 60px)", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: 24,
          }}>
            <Eyebrow>Party starting</Eyebrow>
            <div style={{ fontWeight: 800, fontSize: 96, letterSpacing: "-0.05em", lineHeight: 1, color: SOLO.accent }}>
              {Math.ceil(countdownMs / 1000)}
            </div>
            <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3, letterSpacing: "0.04em" }}>
              {totalPlayers || roomPlayers.length} players locked in
            </div>
          </div>
        )}

        {/* ===== PLAYING ===== */}
        {phase === "playing" && currentRound && (
          <div style={{ paddingTop: 68, maxWidth: 720, margin: "0 auto", padding: "80px 24px 40px" }}>
            {/* Waveform placeholder */}
            <div style={{
              height: 80, background: SOLO.bg2, borderRadius: 10, marginBottom: 28,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              border: `1px solid ${SOLO.line}`,
            }}>
              {Array.from({ length: 32 }).map((_, i) => (
                <div key={i} style={{
                  width: 3, borderRadius: 2,
                  height: `${20 + Math.random() * 60}%`,
                  background: myAnswer.status === null ? SOLO.accent : SOLO.fg4,
                  opacity: myAnswer.status === null ? 0.7 : 0.3,
                }} />
              ))}
              <div style={{ position: "absolute", fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.06em" }}>
                Audio only · live
              </div>
            </div>

            {myAnswer.status !== null ? (
              <div style={{
                background: myAnswer.status === "answered" ? "rgba(125,211,143,.06)" : "rgba(239,104,104,.06)",
                border: `1px solid ${myAnswer.status === "answered" ? "rgba(125,211,143,.25)" : "rgba(239,104,104,.25)"}`,
                borderRadius: 10, padding: "18px 22px", textAlign: "center",
              }}>
                <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.06em", marginBottom: 8 }}>
                  {myAnswer.status === "answered" ? "Answer submitted" : "Locked out"}
                </div>
                <div style={{ fontSize: 14, color: SOLO.fg2 }}>
                  {myAnswer.status === "answered" ? "Waiting for others…" : "Wrong answer — wait for the reveal."}
                </div>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                  Anime title
                </div>
                <div style={{ position: "relative" }}>
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      socketRef.current?.sendTyping();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && suggestions.length > 0) {
                        submitAnswer(suggestions[0].id);
                      }
                    }}
                    placeholder="Type the anime title…"
                    autoComplete="off"
                    style={{
                      width: "100%", boxSizing: "border-box",
                      background: SOLO.bg2, border: `1px solid ${SOLO.line2}`,
                      borderRadius: 8, padding: "14px 16px",
                      color: SOLO.fg, fontFamily: SOLO.sans, fontSize: 15,
                      outline: "none",
                    }}
                  />
                  {suggestions.length > 0 && (
                    <div style={{
                      position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 20,
                      background: SOLO.bg2, border: `1px solid ${SOLO.line2}`, borderRadius: 8,
                      overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.4)",
                    }}>
                      {suggestions.map((s, i) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => submitAnswer(s.id)}
                          style={{
                            display: "block", width: "100%", textAlign: "left",
                            background: i === 0 ? "rgba(167,139,250,.08)" : "transparent",
                            border: "none", borderBottom: i < suggestions.length - 1 ? `1px solid ${SOLO.line}` : "none",
                            padding: "12px 16px", cursor: "pointer", color: SOLO.fg,
                          }}
                        >
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{s.anime_name || s.title}</div>
                          <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, marginTop: 2 }}>
                            {s.title !== s.anime_name && s.title}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, marginTop: 8, letterSpacing: "0.04em" }}>
                  A wrong guess locks you out · ↵ Enter to submit first suggestion
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== ROUND END ===== */}
        {phase === "round-end" && roundEndData && currentRound && (
          <div style={{ paddingTop: 68, maxWidth: 1000, margin: "0 auto", padding: "80px 24px 40px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: 28 }}>
              {/* Left: verdict + opening card */}
              <div>
                {user && roundEndData.responses[user.id] && (
                  <div style={{ marginBottom: 20 }}>
                    <Eyebrow color={roundEndData.responses[user.id].was_correct ? SOLO.ok : SOLO.danger}>
                      {roundEndData.responses[user.id].was_correct ? "You got it" : roundEndData.responses[user.id].status === "locked" ? "Wrong answer" : "Timeout"}
                    </Eyebrow>
                    {roundEndData.responses[user.id].was_correct && (
                      <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3, marginTop: 6 }}>
                        +{roundEndData.responses[user.id].points_earned} pts
                        {roundEndData.responses[user.id].rank && ` · placed #${roundEndData.responses[user.id].rank} this round`}
                        {roundEndData.responses[user.id].response_ms && ` · ${(roundEndData.responses[user.id].response_ms! / 1000).toFixed(1)}s`}
                      </div>
                    )}
                  </div>
                )}

                {/* Opening reveal card */}
                {roundEndData.correct_opening && (
                  <div style={{
                    background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 10, padding: 16,
                    display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 20,
                  }}>
                    {roundEndData.correct_opening.anime_cover_url && (
                      <img
                        src={roundEndData.correct_opening.anime_cover_url}
                        alt=""
                        style={{ width: 64, height: 88, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
                      />
                    )}
                    <div>
                      <div style={{ fontFamily: SOLO.mono, fontSize: 9, color: SOLO.fg4, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>
                        {roundEndData.correct_opening.year ? `${roundEndData.correct_opening.year} · ` : ""}Opening
                      </div>
                      <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2, marginBottom: 4 }}>
                        {roundEndData.correct_opening.anime_name}
                      </div>
                      <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3 }}>
                        {roundEndData.correct_opening.title}
                      </div>
                      {roundEndData.correct_opening.singer_name && (
                        <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg4, marginTop: 4 }}>
                          {roundEndData.correct_opening.singer_name}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Next round timer */}
                <div style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3, letterSpacing: "0.04em" }}>
                  Next round in <span style={{ color: SOLO.accent }}>{Math.ceil(nextRoundMs / 1000)}s</span>
                </div>
              </div>

              {/* Right: standings */}
              <div>
                <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                  Standings
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {standings.slice(0, 8).map((s) => {
                    const isMe = user && s.user_id === user.id;
                    const resp = roundEndData.responses[s.user_id];
                    return (
                      <div key={s.user_id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                        background: isMe ? "rgba(167,139,250,.08)" : SOLO.bg2,
                        border: `1px solid ${isMe ? SOLO.accent + "44" : SOLO.line}`,
                        borderRadius: 8,
                      }}>
                        <span style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg4, width: 20, textAlign: "right" }}>
                          {s.rank}
                        </span>
                        <div style={{
                          width: 28, height: 28, borderRadius: "50%",
                          background: isMe ? SOLO.accent : SOLO.bg3,
                          display: "grid", placeItems: "center", flexShrink: 0,
                          fontFamily: SOLO.mono, fontSize: 12, color: isMe ? SOLO.bg : SOLO.fg2,
                        }}>
                          {s.avatar_url ? (
                            <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                          ) : s.display_name.charAt(0).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: isMe ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {s.display_name}
                          </div>
                        </div>
                        {resp && (
                          <span style={{
                            fontFamily: SOLO.mono, fontSize: 10,
                            color: resp.was_correct ? SOLO.ok : SOLO.fg4,
                          }}>
                            {resp.was_correct ? `${(resp.response_ms! / 1000).toFixed(1)}s` : "—"}
                          </span>
                        )}
                        <span style={{ fontFamily: SOLO.mono, fontSize: 12, fontWeight: 600, color: SOLO.fg, minWidth: 48, textAlign: "right" }}>
                          {s.score}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== MATCH END ===== */}
        {phase === "ended" && matchEndData && (
          <div style={{ maxWidth: 900, margin: "0 auto", padding: "48px 24px" }}>
            {/* Winner headline */}
            <div style={{ marginBottom: 32 }}>
              {matchEndData.winner_user_id && (
                <>
                  <Eyebrow>Party complete</Eyebrow>
                  <h1 style={{ margin: "10px 0 4px", fontWeight: 800, fontSize: 48, letterSpacing: "-0.04em", lineHeight: 1 }}>
                    {standings[0]?.display_name ?? "Someone"}{" "}
                    <span style={{ color: SOLO.accent }}>wins.</span>
                  </h1>
                  <p style={{ color: SOLO.fg2, fontSize: 14 }}>
                    {(matchEndData.duration_ms / 60000).toFixed(0)} min · {standings.length} players · {matchEndData.rounds.length} rounds
                  </p>
                </>
              )}
              {user && (
                <div style={{
                  display: "inline-flex", alignItems: "center", gap: 10, marginTop: 12,
                  background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 8, padding: "10px 16px",
                }}>
                  <span style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg3 }}>Your finish</span>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>
                    #{myRank ?? "?"} · {myScore} pts
                  </span>
                </div>
              )}
            </div>

            {/* Podium (top 3) */}
            {standings.length >= 3 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 28 }}>
                {[standings[1], standings[0], standings[2]].map((s, i) => {
                  const actualRank = [2, 1, 3][i];
                  const isMe = user && s?.user_id === user.id;
                  return s ? (
                    <div key={s.user_id} style={{
                      background: SOLO.bg2, border: `1px solid ${isMe ? SOLO.accent + "55" : SOLO.line}`,
                      borderRadius: 10, padding: "16px 12px", textAlign: "center",
                      paddingTop: actualRank === 1 ? 12 : 16,
                    }}>
                      <div style={{
                        fontFamily: SOLO.mono, fontSize: actualRank === 1 ? 16 : 13,
                        color: actualRank === 1 ? SOLO.warn : SOLO.fg3, marginBottom: 8,
                      }}>
                        {actualRank === 1 ? "🥇 1st" : actualRank === 2 ? "🥈 2nd" : "🥉 3rd"}
                      </div>
                      <div style={{
                        width: actualRank === 1 ? 56 : 44, height: actualRank === 1 ? 56 : 44,
                        borderRadius: "50%", background: isMe ? SOLO.accent : SOLO.bg3,
                        margin: "0 auto 10px",
                        display: "grid", placeItems: "center",
                        fontFamily: SOLO.mono, fontSize: 18, color: isMe ? SOLO.bg : SOLO.fg2,
                        overflow: "hidden",
                      }}>
                        {s.avatar_url ? (
                          <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : s.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{s.display_name}</div>
                      <div style={{ fontFamily: SOLO.mono, fontSize: 14, color: SOLO.accent, fontWeight: 700 }}>{s.score} pts</div>
                    </div>
                  ) : null;
                })}
              </div>
            )}

            {/* Full leaderboard */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10 }}>
                Final standings
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {standings.map((s) => {
                  const isMe = user && s.user_id === user.id;
                  return (
                    <div key={s.user_id} style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                      background: isMe ? "rgba(167,139,250,.08)" : SOLO.bg2,
                      border: `1px solid ${isMe ? SOLO.accent + "44" : SOLO.line}`,
                      borderRadius: 8,
                    }}>
                      <span style={{ fontFamily: SOLO.mono, fontSize: 12, color: SOLO.fg4, width: 24, textAlign: "right" }}>{s.rank}</span>
                      <div style={{
                        width: 32, height: 32, borderRadius: "50%",
                        background: isMe ? SOLO.accent : SOLO.bg3,
                        display: "grid", placeItems: "center", flexShrink: 0,
                        fontFamily: SOLO.mono, fontSize: 13, color: isMe ? SOLO.bg : SOLO.fg2,
                        overflow: "hidden",
                      }}>
                        {s.avatar_url ? (
                          <img src={s.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
                        ) : s.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>{s.display_name}</div>
                      <div style={{ fontFamily: SOLO.mono, fontSize: 14, fontWeight: 700, color: SOLO.fg }}>{s.score}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 12 }}>
              <Link href="/play" style={{
                background: SOLO.bg2, border: `1px solid ${SOLO.line2}`,
                borderRadius: 8, padding: "12px 20px", color: SOLO.fg2, textDecoration: "none", fontSize: 14,
              }}>
                Back to play
              </Link>
              <Link href="/play/party/new" style={{
                background: SOLO.accent, color: SOLO.bg, borderRadius: 8,
                padding: "12px 20px", textDecoration: "none", fontSize: 14, fontWeight: 600,
              }}>
                New party →
              </Link>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
