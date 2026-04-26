import type { GetServerSideProps } from "next";
import Link from "next/link";
import Layout from "@/components/Layout";
import GroupsPanel from "@/components/GroupsPanel";
import AvatarManager from "@/components/AvatarManager";
import { listMyGroups } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { Group, User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  groups: Group[];
  apiOnline: boolean;
}

const ROLE_LABEL: Record<User["role"], string> = {
  user: "User",
  moderator: "Moderator",
  admin: "Admin",
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);

  // Profile is only meaningful for logged-in users.
  if (!session.user) {
    return {
      redirect: { destination: "/login?next=/me", permanent: false },
    };
  }

  let groups: Group[] = [];
  let apiOnline = true;
  try {
    groups = session.mockGroups ?? (await listMyGroups(session.cookie).catch(() => []));
  } catch {
    apiOnline = false;
  }

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      groups,
      apiOnline,
    },
  };
};

function formatJoined(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}


export default function ProfilePage({ user, modQueueCount, groups, apiOnline }: Props) {
  const totalOpenings = groups.reduce((sum, g) => sum + g.opening_count, 0);
  const publicGroups = groups.filter((g) => g.is_public).length;

  return (
    <Layout
      user={user}
      modQueueCount={modQueueCount}
      title={`${user.display_name} — Profile`}
      description={`${user.display_name}'s profile on Opening Wiki.`}
    >
      <div className="wrap">
        <div className="detail-crumb">
          <Link href="/">← Home</Link>
        </div>

        <header className="profile-head">
          {/* Header avatar is the upload trigger — clicking it opens the
              file picker; a small × on hover removes the existing image. */}
          <AvatarManager user={user} variant="head" />
          <div className="profile-meta">
            <p className="entity-kind">Profile</p>
            <h1 className="entity-name">{user.display_name}</h1>
            <p className="profile-email">{user.email}</p>
            <div className="profile-badges">
              <span className={`profile-role role-${user.role}`}>{ROLE_LABEL[user.role]}</span>
              <span className="profile-joined">Joined {formatJoined(user.created_at)}</span>
            </div>
          </div>
          <div className="profile-actions">
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="btn ghost sm">Log out</button>
            </form>
          </div>
        </header>

        <div className="profile-stats">
          <div className="profile-stat">
            <span className="profile-stat-n">{groups.length}</span>
            <span className="profile-stat-l">Groups</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-n">{totalOpenings}</span>
            <span className="profile-stat-l">Saved openings</span>
          </div>
          <div className="profile-stat">
            <span className="profile-stat-n">{publicGroups}</span>
            <span className="profile-stat-l">Public groups</span>
          </div>
        </div>

        <div className="page-grid">
          <div>
            <section className="profile-section">
              <h2 className="profile-section-h">Quick links</h2>
              <div className="profile-links">
                <Link href="/groups" className="profile-link">
                  <span className="profile-link-h">Manage groups</span>
                  <span className="profile-link-d">
                    Create, share or curate your collections.
                  </span>
                </Link>
                <Link href="/submit" className="profile-link">
                  <span className="profile-link-h">Submit an opening</span>
                  <span className="profile-link-d">
                    Add a new opening for moderation review.
                  </span>
                </Link>
                {(user.role === "moderator" || user.role === "admin") && (
                  <Link href="/mod/queue" className="profile-link">
                    <span className="profile-link-h">
                      Moderation queue
                      {modQueueCount > 0 && (
                        <span className="profile-link-badge">{modQueueCount}</span>
                      )}
                    </span>
                    <span className="profile-link-d">Approve or reject pending submissions.</span>
                  </Link>
                )}
                {user.role === "admin" && (
                  <Link href="/admin/users" className="profile-link">
                    <span className="profile-link-h">Manage users</span>
                    <span className="profile-link-d">Promote, demote, or remove users.</span>
                  </Link>
                )}
              </div>
            </section>

            <section className="profile-section">
              <h2 className="profile-section-h">Account</h2>
              <dl className="profile-dl">
                <dt>Display name</dt>
                <dd>{user.display_name}</dd>
                <dt>Email</dt>
                <dd>{user.email}</dd>
                <dt>Role</dt>
                <dd>{ROLE_LABEL[user.role]}</dd>
                <dt>User ID</dt>
                <dd className="mono">{user.id}</dd>
                <dt>Joined</dt>
                <dd>{formatJoined(user.created_at)}</dd>
              </dl>
            </section>
          </div>

          <aside className="side">
            {groups.length > 0 ? (
              <GroupsPanel groups={groups} />
            ) : (
              <div className="panel">
                <div className="panel-head"><span>Your groups</span></div>
                <div className="rate-body">
                  <p className="rate-hint">No groups yet.</p>
                  <Link href="/groups?new=1" className="btn primary sm" style={{ width: "100%", justifyContent: "center" }}>
                    Create one
                  </Link>
                </div>
              </div>
            )}
          </aside>
        </div>

        {!apiOnline && <p className="mock-notice">⚠ Go API unreachable.</p>}
      </div>
    </Layout>
  );
}
