import type { NextApiRequest, NextApiResponse } from "next";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

let cachedToken = "";
let tokenExpiry = 0;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiry - 30_000) return cachedToken;

  const clientId = process.env.SPOTIFY_CLIENT_ID ?? "";
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET ?? "";
  if (!clientId || !clientSecret) throw new Error("Spotify credentials not configured");

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) throw new Error(`Spotify token request failed: ${res.status}`);

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = ((req.query.q as string) ?? "").trim();
  if (!q) return res.status(200).json({ data: [] });

  let token: string;
  try {
    token = await getAccessToken();
  } catch {
    return res.status(503).json({ error: "Spotify not configured" });
  }

  let response: Response;
  try {
    response = await fetch(
      `${SEARCH_URL}?q=${encodeURIComponent(q)}&type=artist&limit=8&market=JP`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  } catch {
    return res.status(502).json({ error: "Spotify unreachable" });
  }

  if (!response.ok) {
    return res.status(502).json({ error: "Spotify request failed" });
  }

  const json = await response.json();
  const artists: any[] = json?.artists?.items ?? [];

  const results = artists.map((a) => ({
    id: a.id as string,
    name: a.name as string,
    cover_url: (a.images?.[0]?.url as string) ?? null,
    reference_url: (a.external_urls?.spotify as string) ?? `https://open.spotify.com/artist/${a.id}`,
    genres: (a.genres as string[]) ?? [],
  }));

  return res.status(200).json({ data: results });
}
