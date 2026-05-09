import type { GetServerSideProps } from "next";
import Layout from "@/components/Layout";
import SearchHeader from "@/components/SearchHeader";
import CatalogTabs from "@/components/CatalogTabs";
import SortBar from "@/components/SortBar";
import OpeningCard from "@/components/OpeningCard";
import Pagination from "@/components/Pagination";
import GroupsPanel from "@/components/GroupsPanel";
import AuthCard from "@/components/AuthCard";
import SubmitCard from "@/components/SubmitCard";

import { getKindCounts, listMyGroups, listOpenings } from "@/lib/api";
import type { KindCounts } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { mockGroups, mockOpenings } from "@/lib/mock";
import type {
  Group,
  OpeningPage,
  SortKey,
  TrackKind,
  User,
} from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  page: OpeningPage;
  groups: Group[];
  kindCounts: KindCounts;
  q: string;
  sort: SortKey;
  kind: TrackKind;
  apiOnline: boolean;
}

const VALID_SORTS: SortKey[] = ["newest", "top", "most_rated"];
const DEFAULT_SORT: SortKey = "top";
const VALID_KINDS: TrackKind[] = ["opening", "ending", "ost"];
const DEFAULT_KIND: TrackKind = "opening";

function pickSort(value: unknown): SortKey {
  return typeof value === "string" && (VALID_SORTS as string[]).includes(value)
    ? (value as SortKey)
    : DEFAULT_SORT;
}

function pickKind(value: unknown): TrackKind {
  return typeof value === "string" && (VALID_KINDS as string[]).includes(value)
    ? (value as TrackKind)
    : DEFAULT_KIND;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);

  const q = typeof ctx.query.q === "string" ? ctx.query.q.trim() : "";
  const sort = pickSort(ctx.query.sort);
  const kind = pickKind(ctx.query.kind);
  const page = Number(ctx.query.page ?? 1) || 1;

  let openingsPage: OpeningPage;
  let kindCounts: KindCounts = { opening: 0, ending: 0, ost: 0 };
  let groups: Group[] = [];
  let apiOnline = true;

  try {
    [openingsPage, kindCounts] = await Promise.all([
      listOpenings({ q, sort, kind, page, cookie: session.cookie }),
      getKindCounts(session.cookie).catch(() => ({ opening: 0, ending: 0, ost: 0 })),
    ]);
    if (session.user) {
      groups = session.mockGroups ?? await listMyGroups(session.cookie).catch(() => []);
    }
  } catch {
    apiOnline = false;
    openingsPage = mockOpenings();
    kindCounts = { opening: 2418, ending: 1872, ost: 3104 };
    groups = session.mockGroups ?? (session.user ? mockGroups() : []);
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      page: openingsPage,
      groups,
      kindCounts,
      q,
      sort,
      kind,
      apiOnline,
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
  kindCounts,
  q,
  sort,
  kind,
  apiOnline,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(page.total / page.per_page));

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="Opening Wiki">
      <div className="wrap">
        <SearchHeader
          total={kindCounts[kind] || page.total}
          q={q}
          kind={kind}
        />

        <CatalogTabs
          activeKind={kind}
          counts={kindCounts}
          q={q || undefined}
          sort={sort !== DEFAULT_SORT ? sort : undefined}
        />

        <div className="page-grid">
          <div>
            <SortBar
              total={page.total}
              sort={sort}
              basePath="/"
              q={q || undefined}
              kind={kind}
            />

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
              query={{
                kind,
                q: q || undefined,
                sort: sort !== DEFAULT_SORT ? sort : undefined,
              }}
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
