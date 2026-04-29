import type { GetServerSideProps } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useState } from "react";
import Layout from "@/components/Layout";
import { listMyGroups, listPublicGroups } from "@/lib/api";
import { loadSession } from "@/lib/session";
import { mockGroups } from "@/lib/mock";
import { pushToast } from "@/lib/toast";
import type { Group, PublicGroupSummary, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
  groups: Group[];
  publicGroups: PublicGroupSummary[];
  showCreateForm: boolean;
  showPublicGroups: boolean;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/groups", permanent: false } };
  }
  const groups = await listMyGroups(session.cookie).catch(() => mockGroups());
  const showCreateForm = ctx.query.new === "1" || ctx.query.new === "";
  const showPublicGroups = ctx.query.public === "1" || ctx.query.public === "";
  const publicGroups = showPublicGroups
    ? await listPublicGroups(session.cookie).catch(() => [])
    : [];
  return {
    props: {
      user: session.user,
      modQueueCount: session.modQueueCount,
      groups,
      publicGroups,
      showCreateForm,
      showPublicGroups,
    },
  };
};

interface CreateFormProps {
  defaultOpen: boolean;
  onCreated: (groupId: string) => void;
}

function CreateGroupForm({ defaultOpen, onCreated }: CreateFormProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed || busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/groups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            description: description.trim(),
            is_public: isPublic,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error ?? `Create failed (${res.status})`);
        }
        const created: Group = await res.json();
        pushToast({ kind: "success", message: `Created "${created.name}"` });
        onCreated(created.id);
        setName("");
        setDescription("");
        setIsPublic(false);
        setOpen(false);
      } catch (err) {
        pushToast({
          kind: "error",
          message: err instanceof Error ? err.message : "Could not create group",
        });
      } finally {
        setBusy(false);
      }
    },
    [name, description, isPublic, busy, onCreated],
  );

  if (!open) {
    return (
      <button
        type="button"
        className="btn primary"
        style={{ alignSelf: "flex-start" }}
        onClick={() => setOpen(true)}
      >
        + New group
      </button>
    );
  }

  return (
    <form className="group-create" onSubmit={submit}>
      <h2 className="group-create-h">Create a group</h2>
      <label className="group-create-field">
        <span>Name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          autoFocus
          placeholder="e.g. Bangers from 2010s"
          disabled={busy}
        />
      </label>
      <label className="group-create-field">
        <span>Description (optional)</span>
        <textarea
          name="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
          rows={3}
          placeholder="What's this collection about?"
          disabled={busy}
        />
      </label>
      <label className="group-create-check">
        <input
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          disabled={busy}
        />
        <span>Make it public — anyone with the link can view it</span>
      </label>
      <div className="group-create-actions">
        <button type="button" className="btn ghost sm" onClick={() => setOpen(false)} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className="btn primary sm" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create"}
        </button>
      </div>
    </form>
  );
}

export default function GroupsPage({
  user,
  modQueueCount,
  groups,
  publicGroups,
  showCreateForm,
  showPublicGroups,
}: Props) {
  const router = useRouter();

  const handleCreated = useCallback(
    (groupId: string) => {
      // Refresh SSR so the new group appears in the list, then strip ?new=1.
      const { new: _new, ...rest } = router.query;
      void _new;
      router.replace({ pathname: "/groups", query: rest }, undefined, { scroll: false });
      void groupId;
    },
    [router],
  );

  const togglePublicGroups = useCallback(() => {
    const { public: _public, ...rest } = router.query;
    void _public;
    const query = showPublicGroups ? rest : { ...rest, public: "1" };
    router.replace({ pathname: "/groups", query }, undefined, { scroll: false });
  }, [router, showPublicGroups]);

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="My groups">
      <div className="wrap" style={{ paddingTop: 32, paddingBottom: 64 }}>
        <header style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 6px" }}>
            My groups
          </h1>
          <p style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 12, margin: 0 }}>
            {groups.length} group{groups.length === 1 ? "" : "s"}
          </p>
        </header>

        <div style={{ marginBottom: 24 }}>
          <CreateGroupForm defaultOpen={showCreateForm} onCreated={handleCreated} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <button type="button" className="btn sm" onClick={togglePublicGroups}>
            {showPublicGroups ? "Hide public groups" : "Show public groups"}
          </button>
        </div>

        <div className="panel" style={{ maxWidth: 520 }}>
          <div className="grp-list">
            {groups.length === 0 ? (
              <p className="search-empty" style={{ padding: 18 }}>
                No groups yet. Create one above to start collecting openings.
              </p>
            ) : (
              groups.map((g) => (
                <div
                  key={g.id}
                  className={`grp-item-wrap ${g.is_system_rated ? "system" : g.is_public ? "public" : ""}`.trim()}
                >
                  <Link
                    href={`/groups/${g.id}`}
                    className={`grp-item ${g.is_system_rated ? "system" : g.is_public ? "public" : ""}`.trim()}
                  >
                    <span className="grp-icon">•</span>
                    <span className="grp-name">{g.name}</span>
                    <span className="grp-count">{g.opening_count}</span>
                  </Link>
                  {g.is_public && g.share_slug && (
                    <Link className="grp-public-link" href={`/g/${g.share_slug}`} title="Open public page">
                      Public
                    </Link>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {showPublicGroups && (
          <div className="panel" style={{ maxWidth: 640, marginTop: 24 }}>
            <div className="panel-head">
              <span>Public groups</span>
            </div>
            <div className="grp-list">
              {publicGroups.length === 0 ? (
                <p className="search-empty" style={{ padding: 18 }}>
                  No public groups yet.
                </p>
              ) : (
                publicGroups.map((group) => (
                  <Link key={group.id} href={`/g/${group.share_slug}`} className="grp-public-item">
                    <div className="grp-public-main">
                      <span className="grp-name">{group.name}</span>
                      <span className="grp-public-owner">by {group.owner.display_name}</span>
                    </div>
                    <span className="grp-count">{group.opening_count}</span>
                  </Link>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
