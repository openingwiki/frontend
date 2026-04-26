import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import { listMyGroups } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { mockGroups } from "@/lib/mock";
import type { Group, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  groups: Group[];
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/groups", permanent: false } };
  }
  const groups = await listMyGroups(session.cookie).catch(() => mockGroups());
  return {
    props: { user: session.user, modQueueCount: session.modQueueCount, groups },
  };
};

export default function GroupsPage({ user, modQueueCount, groups }: Props) {
  return (
    <Layout user={user} modQueueCount={modQueueCount} title="My groups">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 24px" }}>My groups</h1>
        <div className="panel" style={{ maxWidth: 520 }}>
          <div className="grp-list">
            {groups.map((g) => (
              <Link
                key={g.id}
                href={g.is_public && g.share_slug ? `/g/${g.share_slug}` : `/groups/${g.id}`}
                className={`grp-item ${g.is_system_rated ? "system" : g.is_public ? "public" : ""}`.trim()}
              >
                <span className="grp-icon">•</span>
                <span className="grp-name">{g.name}</span>
                <span className="grp-count">{g.opening_count}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
