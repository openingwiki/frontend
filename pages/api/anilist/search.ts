import type { NextApiRequest, NextApiResponse } from "next";

const ANILIST_URL = "https://graphql.anilist.co";

const QUERY = `
query ($search: String) {
  Page(perPage: 12) {
    media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
      id
      title { romaji english native }
      startDate { year }
      format
      episodes
      studios(isMain: true) { nodes { name } }
      coverImage { large }
      siteUrl
      relations {
        edges { relationType(version: 2) }
      }
    }
  }
}
`;

const FORMAT_MAP: Record<string, string> = {
  TV: "tv",
  TV_SHORT: "tv",
  MOVIE: "film",
  OVA: "ova_ona",
  ONA: "ova_ona",
  SPECIAL: "special",
  MUSIC: "special",
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const q = ((req.query.q as string) ?? "").trim();
  if (!q) return res.status(200).json({ data: [] });

  let response: Response;
  try {
    response = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: QUERY, variables: { search: q } }),
    });
  } catch {
    return res.status(502).json({ error: "AniList unreachable" });
  }

  if (!response.ok) {
    return res.status(502).json({ error: "AniList request failed" });
  }

  const json = await response.json();
  const media: any[] = json?.data?.Page?.media ?? [];

  // Only show entries with no PREQUEL relation — first in series only
  const results = media
    .filter((m) => {
      const edges: any[] = m.relations?.edges ?? [];
      return !edges.some((e) => e.relationType === "PREQUEL");
    })
    .map((m) => ({
      id: String(m.id),
      title_romaji: m.title?.romaji ?? "",
      title_english: m.title?.english ?? "",
      title_native: m.title?.native ?? "",
      year: m.startDate?.year ?? null,
      format: FORMAT_MAP[m.format ?? ""] ?? "tv",
      episodes: m.episodes ?? null,
      studio: m.studios?.nodes?.[0]?.name ?? "",
      cover_url: m.coverImage?.large ?? null,
      reference_url: m.siteUrl ?? "",
    }));

  return res.status(200).json({ data: results });
}
