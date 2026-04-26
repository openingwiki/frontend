import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import { getAnime } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { AnimeDetail, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  anime: AnimeDetail | null;
  apiOnline: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  let anime: AnimeDetail | null = null;
  let apiOnline = true;

  try {
    anime = await getAnime(id, session.cookie);
  } catch {
    apiOnline = false;
    anime = null;
  }

  if (!anime) {
    return { notFound: true };
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      anime,
      apiOnline,
    },
  };
};

export default function AnimePage({ user, modQueueCount, anime, apiOnline }: Props) {
  const a = anime!;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${a.name} — Opening Wiki`}
      description={`All openings from ${a.name}.`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href="/">← All openings</Link>
        </div>

        <header className="entity-head">
          <div className="entity-cover" aria-hidden>
            {a.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.cover_image_url} alt="" />
            ) : (
              <span className="entity-cover-fallback">{a.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="entity-head-meta">
            <p className="entity-kind">Anime</p>
            <h1 className="entity-name">{a.name}</h1>
            <p className="entity-stat">
              {a.openings.length} opening{a.openings.length === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {a.openings.length === 0 ? (
          <p className="entity-empty">No approved openings yet.</p>
        ) : (
          <ul className="entity-op-list">
            {a.openings.map((op) => (
              <li key={op.id} className="entity-op-row">
                <Link href={`/openings/${op.id}`} className="entity-op-title">
                  {op.title}
                </Link>
                <Link href={`/singers/${op.singer.id}`} className="entity-op-related">
                  {op.singer.name}
                </Link>
                <div className="entity-op-score">
                  <span className="entity-op-score-n">{op.avg_rating.toFixed(1)}</span>
                  <span className="entity-op-score-d">/10</span>
                  <span className="entity-op-score-c">{op.rating_count.toLocaleString()}</span>
                </div>
                <a
                  href={op.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="entity-op-yt"
                  aria-label="Open on YouTube"
                >
                  ↗
                </a>
              </li>
            ))}
          </ul>
        )}

        {!apiOnline && (
          <p className="mock-notice">⚠ Go API unreachable.</p>
        )}
      </div>
    </Layout>
  );
}
