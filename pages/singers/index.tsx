import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import LiveSearchInput from "@/components/LiveSearchInput";
import { listOpenings, searchAll } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { SearchEntityHit, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  q: string;
  hits: SearchEntityHit[];
  totalOpenings: number;
  apiOnline: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const q = typeof ctx.query.q === "string" ? ctx.query.q.trim() : "";

  let hits: SearchEntityHit[] = [];
  let totalOpenings = 0;
  let apiOnline = true;

  try {
    if (q) {
      const res = await searchAll({ q, types: ["singer"], limit: 25, cookie: session.cookie });
      hits = res.singers;
    }
    const page = await listOpenings({ page: 1, cookie: session.cookie }).catch(() => null);
    totalOpenings = page?.total ?? 0;
  } catch {
    apiOnline = false;
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      q,
      hits,
      totalOpenings,
      apiOnline,
    },
  };
};

export default function SingersBrowsePage({
  user,
  modQueueCount,
  q,
  hits,
  totalOpenings,
  apiOnline,
}: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Singers — Opening Wiki">
      <div className="wrap">
        <div className="head">
          <h1>
            Browse <em>singers.</em>
          </h1>
          <p>
            Search the catalogue · {totalOpenings.toLocaleString()} openings indexed.
          </p>
          <LiveSearchInput
            basePath="/singers"
            initialQ={q}
            placeholder="Search singers by name…"
            ariaLabel="Search singers"
            autoFocus
          />
        </div>

        {!q ? (
          <p className="browse-hint">
            Start typing above to find singers. Or jump straight into{" "}
            <Link href="/">all openings</Link>.
          </p>
        ) : hits.length === 0 ? (
          <p className="entity-empty">
            No singers match “{q}”. <Link href="/singers">Clear</Link>
          </p>
        ) : (
          <div className="browse-grid">
            {hits.map((it) => (
              <Link key={it.id} href={`/singers/${it.id}`} className="browse-card">
                <span className="browse-card-cover" aria-hidden>
                  {it.cover_image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.cover_image_url} alt="" />
                  ) : (
                    <span className="browse-card-fallback">
                      {it.name.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="browse-card-name">{it.name}</span>
              </Link>
            ))}
          </div>
        )}

        {!apiOnline && <p className="mock-notice">⚠ Go API unreachable.</p>}
      </div>
    </Layout>
  );
}
