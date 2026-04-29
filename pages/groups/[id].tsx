import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";
import BackLink from "@/components/BackLink";
import Layout from "@/components/Layout";
import OpeningCard from "@/components/OpeningCard";
import { pushToast } from "@/lib/toast";
import { ApiError, getMyGroup } from "@/lib/api";
import { loadSession } from "@/lib/session";
import type { GroupDetail, GroupOpening, Opening, User } from "@/lib/types";

interface Props {
  user: User;
  modQueueCount: number;
  group: GroupDetail | null;
  shareUrl: string | null;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: `/login?next=/groups/${ctx.params?.id}`, permanent: false } };
  }
  const id = String(ctx.params?.id ?? "");
  let group: GroupDetail | null = null;
  try {
    group = await getMyGroup(id, session.cookie);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 404) {
      // Unknown failure — surface as "not found" rather than 500 so the page
      // still renders. Users can refresh once the API is back.
    }
  }

  // Build absolute share URL on the server so SSR matches client and we don't
  // ever render `null` if window is unavailable.
  const shareUrl =
    group && group.is_public && group.share_slug
      ? `${ctx.req.headers["x-forwarded-proto"] ?? "http"}://${ctx.req.headers.host}/g/${group.share_slug}`
      : null;

  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      group,
      shareUrl,
    },
  };
};

// OpeningCard expects the full Opening shape. Group payloads only carry the
// card-level fields, so fill the rest with neutral defaults — the card never
// reads them.
function asOpening(item: GroupOpening): Opening {
  return {
    ...item,
    status: "approved",
    submitted_by_user_id: "",
    submitted_at: "",
  };
}

export default function PrivateGroupPage({ user, modQueueCount, group, shareUrl }: Props) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);
  const [togglingPublic, setTogglingPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!group) {
    return (
      <Layout user={user} modQueueCount={modQueueCount} title="Group not found">
        <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64, maxWidth: 720 }}>
          <p style={{ marginBottom: 12 }}>
            <BackLink fallbackHref="/groups">← Back</BackLink>
          </p>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 16px" }}>
            Group not found
          </h1>
          <p style={{ color: "var(--fg-2)" }}>
            This group does not exist, or you don&apos;t have access to it.
          </p>
        </div>
      </Layout>
    );
  }

  const visibility = group.is_system_rated ? "System · Rated" : group.is_public ? "Public" : "Private";
  const locked = group.is_system_rated;

  const removeOpening = async (openingID: string) => {
    if (!confirm("Remove this opening from the group?")) return;
    setRemoving(openingID);
    setError(null);
    try {
      const res = await fetch("/api/group-remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: group.id, opening_id: openingID }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Remove failed (${res.status})`);
      }
      router.replace(router.asPath, undefined, { scroll: false });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove opening");
    } finally {
      setRemoving(null);
    }
  };

  const copyShare = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Older browsers / non-secure contexts have no clipboard API — fall back
      // to a select-and-prompt so the user can copy manually.
      window.prompt("Copy share URL:", shareUrl);
    }
  };

  const setPublicVisibility = async (isPublic: boolean) => {
    if (group.is_system_rated || togglingPublic) return;
    setTogglingPublic(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: group.name,
          description: group.description ?? "",
          is_public: isPublic,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Update failed (${res.status})`);
      }
      pushToast({
        kind: "success",
        message: isPublic ? "Group is now public" : "Public group hidden",
      });
      router.replace(router.asPath, undefined, { scroll: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not update group";
      setError(message);
      pushToast({ kind: "error", message });
    } finally {
      setTogglingPublic(false);
    }
  };

  return (
    <Layout user={user} modQueueCount={modQueueCount} title={`${group.name} · My groups`}>
      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <p style={{ marginBottom: 12, color: "var(--fg-3)" }}>
          <BackLink fallbackHref="/groups">← Back</BackLink>
        </p>
        <div className="group-head">
          <div>
            <h1 className="group-title">{group.name}</h1>
            <p className="group-meta">
              {visibility} · {group.openings.length}{" "}
              {group.openings.length === 1 ? "opening" : "openings"}
            </p>
            {group.description && <p className="group-desc">{group.description}</p>}
          </div>
          <div className="group-head-actions">
            {shareUrl && (
              <div className="group-share">
                <span className="group-share-label">Share URL</span>
                <code>{shareUrl}</code>
                <button type="button" className="btn sm" onClick={copyShare}>Copy</button>
                <Link href={`/g/${group.share_slug}`} className="btn sm">Open public page</Link>
              </div>
            )}
            {!group.is_system_rated && (
              <div className="group-visibility-actions">
                {group.is_public ? (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => void setPublicVisibility(false)}
                    disabled={togglingPublic}
                  >
                    {togglingPublic ? "Hiding…" : "Hide public group"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => void setPublicVisibility(true)}
                    disabled={togglingPublic}
                  >
                    {togglingPublic ? "Publishing…" : "Make public"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {error && <p className="mock-notice">{error}</p>}

        {group.openings.length === 0 ? (
          <div className="group-empty">
            <p>This group is empty.</p>
            <p>
              Browse <Link href="/" style={{ color: "var(--accent)" }}>the catalogue</Link>{" "}
              and use <em>+ Add to group</em> on any opening.
            </p>
          </div>
        ) : (
          <div className="cat">
            {group.openings.map((item) => (
              <div key={item.id} className="group-op-wrap">
                <OpeningCard op={asOpening(item)} />
                {!locked && (
                  <button
                    type="button"
                    className="group-op-remove"
                    onClick={() => removeOpening(item.id)}
                    disabled={removing === item.id}
                    aria-label={`Remove ${item.title} from group`}
                  >
                    {removing === item.id ? "…" : "Remove"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
