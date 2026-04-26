// YouTube URL parsing shared across cards (preview thumbnail) and the detail
// page (embed iframe). Accepts the watch / youtu.be / embed shapes; rejects
// anything that doesn't yield an 11-char ID so we never build a broken URL.

const ID_RE = /^[\w-]{11}$/;

export function getYouTubeID(url: string): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    let id: string | null = null;
    if (u.hostname.endsWith("youtu.be")) {
      id = u.pathname.slice(1).split("/")[0];
    } else if (u.pathname.startsWith("/embed/") || u.pathname.startsWith("/v/")) {
      id = u.pathname.split("/")[2] ?? null;
    } else {
      id = u.searchParams.get("v");
    }
    return id && ID_RE.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeThumbnail(url: string): string | null {
  const id = getYouTubeID(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

export function youtubeEmbedURL(url: string): string | null {
  const id = getYouTubeID(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0` : null;
}
