import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import { getSinger } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { SingerDetail, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  singer: SingerDetail | null;
  apiOnline: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const id = ctx.params?.id as string;

  let singer: SingerDetail | null = null;
  let apiOnline = true;

  try {
    singer = await getSinger(id, session.cookie);
  } catch {
    apiOnline = false;
    singer = null;
  }

  if (!singer) {
    return { notFound: true };
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      singer,
      apiOnline,
    },
  };
};

export default function SingerPage({ user, modQueueCount, singer, apiOnline }: Props) {
  const s = singer!;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${s.name} — Opening Wiki`}
      description={`All openings performed by ${s.name}.`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href="/">← All openings</Link>
        </div>

        <header className="entity-head">
          <div className="entity-cover" aria-hidden>
            {s.cover_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={s.cover_image_url} alt="" />
            ) : (
              <span className="entity-cover-fallback">{s.name.slice(0, 2).toUpperCase()}</span>
            )}
          </div>
          <div className="entity-head-meta">
            <p className="entity-kind">Singer</p>
            <h1 className="entity-name">{s.name}</h1>
            <p className="entity-stat">
              {s.openings.length} opening{s.openings.length === 1 ? "" : "s"}
            </p>
          </div>
        </header>

        {s.openings.length === 0 ? (
          <p className="entity-empty">No approved openings yet.</p>
        ) : (
          <ul className="entity-op-list">
            {s.openings.map((op) => (
              <li key={op.id} className="entity-op-row">
                <Link href={`/openings/${op.id}`} className="entity-op-title">
                  {op.title}
                </Link>
                <Link href={`/anime/${op.anime.id}`} className="entity-op-related">
                  {op.anime.name}
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
