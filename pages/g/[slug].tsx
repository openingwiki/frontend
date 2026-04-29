import type { GetServerSideProps } from "next";
import Link from "next/link";
import BackLink from "@/components/BackLink";
import Layout from "@/components/Layout";
import OpeningCard from "@/components/OpeningCard";
import { ApiError, getPublicGroup } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { GroupDetail, GroupOpening, Opening, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  group: GroupDetail | null;
}

// Public group view — no auth required (REQUIREMENTS §3, §4.4).
export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  const slug = String(ctx.params?.slug ?? "");
  let group: GroupDetail | null = null;
  try {
    group = await getPublicGroup(slug, session.cookie);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      // swallow — render not-found state
    }
  }
  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      group,
    },
  };
};

function asOpening(item: GroupOpening): Opening {
  return {
    ...item,
    status: "approved",
    submitted_by_user_id: "",
    submitted_at: "",
  };
}

export default function PublicGroupPage({ user, modQueueCount, group }: Props) {
  if (!group) {
    return (
      <Layout user={user} modQueueCount={modQueueCount} title="Group not found">
        <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Group not found
          </h1>
          <p style={{ color: "var(--fg-2)" }}>
            This shared group does not exist, or it has been made private.
          </p>
          <p style={{ marginTop: 24 }}>
            <BackLink fallbackHref="/groups" className="detail-link">← Back</BackLink>
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout user={user} modQueueCount={modQueueCount} title={`${group.name} · Shared group`}>
      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <p style={{ marginBottom: 12, color: "var(--fg-3)" }}>
          <BackLink fallbackHref="/groups">← Back</BackLink>
        </p>
        <div className="group-head">
          <div>
            <h1 className="group-title">{group.name}</h1>
            <p className="group-meta">
              Shared by {group.owner.display_name} · {group.openings.length}{" "}
              {group.openings.length === 1 ? "opening" : "openings"}
            </p>
            {group.description && <p className="group-desc">{group.description}</p>}
          </div>
        </div>

        {group.openings.length === 0 ? (
          <p className="entity-empty">This group is empty.</p>
        ) : (
          <div className="cat">
            {group.openings.map((item) => (
              <OpeningCard key={item.id} op={asOpening(item)} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
