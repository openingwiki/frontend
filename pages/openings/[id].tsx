import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import { getOpening } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { Opening, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  opening: Opening | null;
  embedUrl: string | null;
}

function youtubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const id =
      u.hostname.includes("youtu.be")
        ? u.pathname.slice(1)
        : u.searchParams.get("v");
    return id ? `https://www.youtube.com/embed/${id}` : null;
  } catch {
    return null;
  }
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  let opening: Opening | null = null;
  try {
    opening = await getOpening(id, session.cookie);
  } catch {
    opening = null;
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      opening,
      embedUrl: opening ? youtubeEmbed(opening.youtube_url) : null,
    },
  };
};

export default function OpeningDetail({ user, modQueueCount, opening, embedUrl }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title={opening?.title ?? "Opening"}>
      <div className="wrap detail">
        <div>
          <div className="video">
            {embedUrl ? (
              <iframe
                src={embedUrl}
                title={opening?.title ?? "Opening"}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <div style={{ padding: 24, color: "var(--fg-3)" }}>Opening not found.</div>
            )}
          </div>
          {opening && (
            <>
              <h1>{opening.title}</h1>
              <div className="meta">
                {opening.anime.name} · {opening.singer.name} · {opening.avg_rating.toFixed(1)}/10 ({opening.rating_count.toLocaleString()})
              </div>
            </>
          )}
        </div>
        <aside className="side">
          <div className="panel" style={{ padding: 18 }}>
            <h4 style={{ margin: 0, fontSize: 14, letterSpacing: "-0.01em" }}>Rate this opening</h4>
            <p style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 6 }}>
              {user ? "Pick 1–10. Goes into your Rated group automatically." : "Log in to rate."}
            </p>
          </div>
        </aside>
      </div>
    </Layout>
  );
}
