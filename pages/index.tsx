import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import SearchHeader from "@/components/SearchHeader";
import SearchResults from "@/components/SearchResults";
import SortBar from "@/components/SortBar";
import OpeningCard from "@/components/OpeningCard";
import Pagination from "@/components/Pagination";
import GroupsPanel from "@/components/GroupsPanel";
import AuthCard from "@/components/AuthCard";
import SubmitCard from "@/components/SubmitCard";

import { getStats, listMyGroups, listOpenings, searchAll } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { mockGroups, mockOpenings, mockStats } from "@/lib/mock";
import type {
  Group,
  OpeningPage,
  SearchResults as SearchResultsT,
  SortKey,
  User,
} from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  page: OpeningPage;
  groups: Group[];
  stats: { openings: number; anime: number; singers: number };
  q: string;
  sort: SortKey;
  apiOnline: boolean;
  search: SearchResultsT | null;
}

const VALID_SORTS: SortKey[] = ["newest", "top", "most_rated"];

function pickSort(value: unknown): SortKey {
  return typeof value === "string" && (VALID_SORTS as string[]).includes(value)
    ? (value as SortKey)
    : "newest";
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);

  const q = typeof ctx.query.q === "string" ? ctx.query.q.trim() : "";
  const sort = pickSort(ctx.query.sort);
  const page = Number(ctx.query.page ?? 1) || 1;

  let openingsPage: OpeningPage;
  let stats = { openings: 0, anime: 0, singers: 0 };
  let groups: Group[] = [];
  let apiOnline = true;
  let search: SearchResultsT | null = null;

  try {
    [openingsPage, stats] = await Promise.all([
      listOpenings({ q, sort, page, cookie: session.cookie }),
      getStats(session.cookie).catch(() => ({ openings: 0, anime: 0, singers: 0 })),
    ]);
    if (session.user) {
      groups = session.mockGroups ?? await listMyGroups(session.cookie).catch(() => []);
    }
    if (q) {
      // Cross-entity matches (anime + singers) shown above the openings list.
      // Failures here are non-fatal — we still render the openings results.
      search = await searchAll({ q, cookie: session.cookie }).catch(() => null);
    }
  } catch {
    apiOnline = false;
    openingsPage = mockOpenings();
    stats = mockStats();
    groups = session.mockGroups ?? (session.user ? mockGroups() : []);
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      page: openingsPage,
      groups,
      stats,
      q,
      sort,
      apiOnline,
      search,
    },
  };
};

function newLabel(submittedAt: string): string | undefined {
  const days = Math.floor((Date.now() - new Date(submittedAt).getTime()) / 86_400_000);
  if (days >= 0 && days <= 7) return `${days || 1}d`;
  return undefined;
}

export default function HomePage({
  user,
  modQueueCount,
  page,
  groups,
  stats,
  q,
  sort,
  apiOnline,
  search,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.per_page));

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Opening Wiki">
      <div className="wrap">
        <SearchHeader
          total={stats.openings || page.total}
          anime={stats.anime}
          singers={stats.singers}
          q={q}
        />

        {search && (
          <SearchResults q={q} anime={search.anime} singers={search.singers} />
        )}

        <SortBar total={page.total} sort={sort} basePath="/" q={q || undefined} />

        <div className="page-grid">
          <div>
            <div className="cat">
              {page.items.map((op) => (
                <OpeningCard
                  key={op.id}
                  op={op}
                  newLabel={op.is_new ? newLabel(op.submitted_at) : undefined}
                />
              ))}
            </div>

            <Pagination
              page={page.page}
              totalPages={totalPages}
              basePath="/"
              query={{ q: q || undefined, sort: sort !== "newest" ? sort : undefined }}
            />
          </div>

          <aside className="side">
            {user ? <GroupsPanel groups={groups} /> : <AuthCard />}
            <SubmitCard authed={!!user} />
          </aside>
        </div>

        {!apiOnline && (
          <p className="mock-notice">
            &#9888; Go API unreachable &#8212; showing fixtures.
          </p>
        )}
      </div>
    </Layout>
  );
}
