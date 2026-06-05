// Party mode types, REST client, and WebSocket wrapper.

export type RoomStatus = "lobby" | "playing" | "ended" | "cancelled";
export type PoolKind = "top_default" | "group";

export interface PartyRoom {
  id: string;
  room_code: string;
  host_user_id: string;
  status: RoomStatus;
  rounds_total: number;
  mode: string;
  pool: { kind: PoolKind; group_id?: string | null };
  winner_user_id: string | null;
  expires_at: string;
  created_at: string;
}

export interface PartyPlayer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  joined_at: string;
}

export interface PartyRoomView {
  room: PartyRoom;
  players: PartyPlayer[];
  you_are: "host" | "player" | "guest";
}

// Wire frames — server → client.
export type FrameType =
  | "lobby.state"
  | "match.countdown"
  | "round.start"
  | "round.snapshot"
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

export interface LobbyStateData {
  room_id: string;
  room_code: string;
  status: RoomStatus;
  rounds_total: number;
  pool: { kind: PoolKind; group_id?: string; display_name: string };
  players: Array<{
    user_id: string;
    display_name: string;
    avatar_url?: string;
  }>;
  host_user_id: string;
  expires_at_ms: number;
}

export interface RoundStartData {
  round_id: string;
  round_no: number;
  rounds_total: number;
  mode: string;
  clip_url: string;
  play_at_ms: number;
  clip_duration_ms: number;
  expires_at_ms: number;
  answered_count: number;
  total_players: number;
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

export interface Standing {
  user_id: string;
  display_name: string;
  avatar_url?: string;
  score: number;
  rank: number;
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
      rank?: number;
      points_earned: number;
    }
  >;
  standings: Standing[];
}

export interface MatchEndData {
  winner_user_id?: string | null;
  final_score: Record<string, number>;
  standings: Standing[];
  rounds: Array<{
    round_no: number;
    winner_user_id?: string | null;
    no_score: boolean;
  }>;
  duration_ms: number;
}

// REST helpers.

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/play/party${path}`, {
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

export const partyClient = {
  createRoom: (rounds_total: number, pool: { kind: PoolKind; group_id?: string }) =>
    call<PartyRoomView>("/rooms", {
      method: "POST",
      body: JSON.stringify({ rounds_total, pool }),
    }),
  getRoom: (code: string) =>
    call<PartyRoomView>(`/rooms/${encodeURIComponent(code)}`),
  join: (code: string) =>
    call<PartyRoomView>(`/rooms/${encodeURIComponent(code)}/join`, { method: "POST" }),
  start: (code: string) =>
    call<PartyRoomView>(`/rooms/${encodeURIComponent(code)}/start`, { method: "POST" }),
  leave: (code: string) =>
    call<{ left: boolean }>(`/rooms/${encodeURIComponent(code)}/leave`, { method: "POST" }),
  mintWSToken: (room_code: string) =>
    call<{ token: string; expires_at: string }>("/socket/token", {
      method: "POST",
      body: JSON.stringify({ room_code }),
    }),
};

// PartySocket wraps the browser WebSocket with reconnect semantics.
export class PartySocket {
  private ws: WebSocket | null = null;
  private closed = false;
  private listeners = new Set<(f: Frame) => void>();
  private statusListeners = new Set<(s: "open" | "closed" | "error") => void>();
  private reconnectDelay = 1000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private code: string) {}

  async connect(): Promise<void> {
    const { token } = await partyClient.mintWSToken(this.code);
    const url = new URL("/api/v1/play/party/socket", window.location.origin);
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
