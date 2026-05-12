import type { GetServerSideProps } from "next";
import { useState, useRef } from "react";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { User, Role } from "@/lib/types";

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  created_at: string;
  email_verified: boolean;
  avatar_url: string | null;
  banned_at: string | null;
}

interface ListPayload {
  data: AdminUser[];
  total: number;
  has_next: boolean;
}

interface Props {
  user: User;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user || session.user.role !== "admin") {
    return { redirect: { destination: "/", permanent: false } };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

const ROLE_OPTIONS: Role[] = ["user", "moderator", "admin"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminUsersPage({ user, modQueueCount }: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ListPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const searchRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function fetchUsers(q: string, p: number) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(q)}&page=${p}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error ?? "Failed to load users.");
      } else {
        setResult(await res.json());
      }
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(q: string) {
    setQuery(q);
    setPage(1);
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(() => fetchUsers(q, 1), 300);
  }

  function handlePage(p: number) {
    setPage(p);
    fetchUsers(query, p);
  }

  async function setBan(targetId: string, banned: boolean) {
    setPending((p) => ({ ...p, [targetId]: true }));
    try {
      const res = await fetch(`/api/admin/users/${targetId}/ban`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banned }),
      });
      if (res.ok) {
        setResult((prev) =>
          prev
            ? {
                ...prev,
                data: prev.data.map((u) =>
                  u.id === targetId ? { ...u, banned_at: banned ? new Date().toISOString() : null } : u
                ),
              }
            : prev
        );
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.error ?? "Action failed.");
      }
    } finally {
      setPending((p) => ({ ...p, [targetId]: false }));
    }
  }

  async function setRole(targetId: string, role: Role) {
    setPending((p) => ({ ...p, [targetId + "_role"]: true }));
    try {
      const res = await fetch(`/api/admin/users/${targetId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        const body = await res.json();
        const updated: AdminUser = body.data;
        setResult((prev) =>
          prev
            ? { ...prev, data: prev.data.map((u) => (u.id === targetId ? { ...u, role: updated.role } : u)) }
            : prev
        );
      } else {
        const body = await res.json().catch(() => ({}));
        alert(body?.error ?? "Role change failed.");
      }
    } finally {
      setPending((p) => ({ ...p, [targetId + "_role"]: false }));
    }
  }

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="User management · Opening Wiki">
      <div className="wrap" style={{ paddingTop: 48, paddingBottom: 64 }}>
        <h1 style={{ fontSize: 28, letterSpacing: "-0.02em", margin: "0 0 24px" }}>User management</h1>

        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          <input
            type="search"
            placeholder="Search by email or display name…"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ flex: 1, maxWidth: 400 }}
            onFocus={() => !result && fetchUsers("", 1)}
          />
        </div>

        {error && <p className="mock-notice">{error}</p>}
        {loading && <p style={{ color: "var(--fg-3)" }}>Loading…</p>}

        {result && (
          <>
            <p style={{ fontSize: 13, color: "var(--fg-3)", marginBottom: 12 }}>
              {result.total} user{result.total !== 1 ? "s" : ""}
            </p>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <th style={thStyle}>User</th>
                    <th style={thStyle}>Email</th>
                    <th style={thStyle}>Joined</th>
                    <th style={thStyle}>Role</th>
                    <th style={thStyle}>Status</th>
                    <th style={thStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((u) => {
                    const isSelf = u.id === user.id;
                    const isBanned = !!u.banned_at;
                    const rowBusy = pending[u.id] || pending[u.id + "_role"];
                    return (
                      <tr
                        key={u.id}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          opacity: isBanned ? 0.6 : 1,
                        }}
                      >
                        <td style={tdStyle}>
                          <span style={{ fontWeight: 500 }}>{u.display_name}</span>
                          <br />
                          <span style={{ fontSize: 11, color: "var(--fg-3)", fontFamily: "var(--mono)" }}>{u.id}</span>
                        </td>
                        <td style={tdStyle}>{u.email}</td>
                        <td style={tdStyle}>{formatDate(u.created_at)}</td>
                        <td style={tdStyle}>
                          <select
                            value={u.role}
                            disabled={isSelf || isBanned || rowBusy}
                            onChange={(e) => setRole(u.id, e.target.value as Role)}
                            style={{ fontSize: 13 }}
                          >
                            {ROLE_OPTIONS.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td style={tdStyle}>
                          {isBanned ? (
                            <span style={{ color: "var(--red, #c0392b)", fontSize: 12 }}>
                              Banned {formatDate(u.banned_at!)}
                            </span>
                          ) : (
                            <span style={{ color: "var(--fg-3)", fontSize: 12 }}>Active</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {!isSelf && (
                            <button
                              className={`btn sm${isBanned ? "" : " ghost"}`}
                              disabled={rowBusy}
                              onClick={() => setBan(u.id, !isBanned)}
                            >
                              {rowBusy ? "…" : isBanned ? "Unban" : "Ban"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
              <button className="btn sm" disabled={page <= 1} onClick={() => handlePage(page - 1)}>
                ← Prev
              </button>
              <span style={{ lineHeight: "32px", fontSize: 13, color: "var(--fg-3)" }}>Page {page}</span>
              <button className="btn sm" disabled={!result.has_next} onClick={() => handlePage(page + 1)}>
                Next →
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 600,
  fontSize: 12,
  color: "var(--fg-3)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  verticalAlign: "middle",
};
