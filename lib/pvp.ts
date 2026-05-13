// PvP types + client. The REST helpers go through Next API routes
// (so the cookie + CSRF flow matches the rest of the mutating API);
// the WebSocket client opens directly against /api/v1/play/pvp/socket
// with a one-shot token minted by /socket/token.

export type MatchFormat = "ft5" | "ft10" | "ft15";
export type PoolKind = "top_default" | "group";
export type MatchStatus =
  | "lobby"
  | "countdown"
  | "playing"
  | "ended"
  | "cancelled"
  | "abandoned";

export interface PvPMatch {
  id: string;
  room_code: string;
  host_user_id: string;
  status: MatchStatus;
  format: MatchFormat;
  target_score: number;
  mode: string;
  pool: { kind: PoolKind; group_id?: string | null };
  winner_user_id: string | null;
  by_forfeit: boolean;
  expires_at: string;
  created_at: string;
}

export interface PvPPlayer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  seat: 1 | 2;
  ready: boolean;
  joined_at: string;
}

export interface PvPMatchView {
  match: PvPMatch;
  players: PvPPlayer[];
  you_are: "host" | "opponent" | "guest";
  h2h?: { wins: number; losses: number };
}

// Wire frames — server → client.
export type FrameType =
  | "lobby.state"
  | "match.countdown"
  | "round.start"
  | "round.end"
  | "match.end"
  | "player.disconnected"
  | "player.reconnected"
  | "input.typing.opp"
  | "server.pong"
  | "error";

export interface Frame<T = unknown> {
  type: FrameType;
  server_now_ms?: number;
  data?: T;
}

export interface RoundStartData {
  round_id: string;
  round_no: number;
  mode: string;
  clip_url: string;
  play_at_ms: number;
  clip_duration_ms: number;
  expires_at_ms: number;
}

export interface OpeningReveal {
  id: string;
  title: string;
  anime_name: string;
  anime_cover_url?: string;
  singer_name: string;
  year?: number;
  avg_rating?: number;
  rating_count?: number;
}

export interface RoundEndData {
  round_id: string;
  winner_user_id?: string | null;
  no_score: boolean;
  correct_opening: OpeningReveal;
  responses: Record<
    string,
    {
      status: "answered" | "locked" | "timeout";
      picked_anime_id?: string | null;
      was_correct?: boolean;
      response_ms?: number;
    }
  >;
  score: Record<string, number>;
}

export interface MatchEndData {
  winner_user_id?: string | null;
  by_forfeit: boolean;
  final_score: Record<string, number>;
  rounds: Array<{
    round_no: number;
    winner_user_id?: string | null;
    no_score: boolean;
    response_ms?: number;
  }>;
  duration_ms: number;
}

export interface PlayerDisconnectData {
  user_id: string;
  grace_expires_at_ms: number;
}

// REST helpers — all go through Next API proxies under /api/play/pvp.

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/play/pvp${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const code = body?.error?.code ?? "request_failed";
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    throw Object.assign(new Error(msg), { code, status: res.status });
  }
  const body = await res.json();
  return body.data as T;
}

export const pvpClient = {
  createMatch: (format: MatchFormat, pool: { kind: PoolKind; group_id?: string }) =>
    call<PvPMatchView>("/matches", {
      method: "POST",
      body: JSON.stringify({ format, pool }),
    }),
  getMatch: (code: string) =>
    call<PvPMatchView>(`/matches/${encodeURIComponent(code)}`),
  join: (code: string) =>
    call<PvPMatchView>(`/matches/${encodeURIComponent(code)}/join`, { method: "POST" }),
  ready: (code: string, ready: boolean) =>
    call<PvPMatchView>(`/matches/${encodeURIComponent(code)}/ready`, {
      method: "POST",
      body: JSON.stringify({ ready }),
    }),
  leave: (code: string) =>
    call<{ left: boolean }>(`/matches/${encodeURIComponent(code)}/leave`, { method: "POST" }),
  cancel: (code: string) =>
    call<{ cancelled: boolean }>(`/matches/${encodeURIComponent(code)}/cancel`, { method: "POST" }),
  rematch: (code: string) =>
    call<PvPMatchView>(`/matches/${encodeURIComponent(code)}/rematch`, { method: "POST" }),
  mintWSToken: (room_code: string) =>
    call<{ token: string; expires_at: string }>("/socket/token", {
      method: "POST",
      body: JSON.stringify({ room_code }),
    }),
};

// PvPSocket wraps the browser WebSocket with reconnect semantics and
// a tiny event emitter. The match page wires its state machine to
// `onFrame` and treats the socket as a black box otherwise.
//
// Reconnect strategy: on close (not user-initiated), mint a fresh
// token and retry with exponential backoff (1s, 2s, 4s, 8s, then
// capped). Tokens are single-shot and short-lived (30s), so we always
// mint a new one rather than reusing the original. Ingress proxies
// quietly drop idle WS connections; without reconnect the user would
// silently miss every lobby.state and match.* frame that arrived
// after the drop.
export class PvPSocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private listeners = new Set<(f: Frame) => void>();
  private statusListeners = new Set<(s: "open" | "closed" | "error") => void>();
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private code: string) {}

  async connect(): Promise<void> {
    const { token } = await pvpClient.mintWSToken(this.code);
    const url = new URL("/api/v1/play/pvp/socket", window.location.origin);
    url.protocol = url.protocol.replace("http", "ws");
    url.searchParams.set("token", token);
    url.searchParams.set("room", this.code);
    const ws = new WebSocket(url.toString());
    this.ws = ws;
    ws.onopen = () => {
      this.reconnectDelay = 1000;
      this.fireStatus("open");
    };
    ws.onclose = () => {
      this.fireStatus("closed");
      this.ws = null;
      if (!this.closed) this.scheduleReconnect();
    };
    ws.onerror = () => this.fireStatus("error");
    ws.onmessage = (e) => {
      try {
        const frame = JSON.parse(e.data) as Frame;
        for (const l of this.listeners) l(frame);
      } catch {
        /* ignore */
      }
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer || this.closed) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 8000);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.closed) return;
      this.connect().catch(() => this.scheduleReconnect());
    }, delay);
  }

  send(type: string, data?: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ type, data }));
  }

  submitAnswer(round_id: string, anime_id: string, client_submit_ms: number) {
    this.send("answer.submit", { round_id, anime_id, client_submit_ms });
  }
  sendTyping() {
    this.send("input.typing");
  }
  sendPing() {
    this.send("client.ping", { client_sent_ms: Date.now() });
  }

  onFrame(fn: (f: Frame) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onStatus(fn: (s: "open" | "closed" | "error") => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
  }

  private fireStatus(s: "open" | "closed" | "error") {
    for (const l of this.statusListeners) l(s);
  }
}

// Wire→view helper: returns the formatted "first to N" target for the
// match HUD.
export function targetFromFormat(format: MatchFormat): number {
  return format === "ft5" ? 5 : format === "ft15" ? 15 : 10;
}
