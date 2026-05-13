import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow } from "@/components/solo/atoms";
import { pvpClient, type MatchFormat } from "@/lib/pvp";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/play/pvp/new", permanent: false } };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

// Format options match the backend's CHECK constraint exactly. Adding
// a fourth format means a migration; the segment buttons here are
// the user-facing copy of that contract.
const FORMATS: { value: MatchFormat; label: string; sub: string }[] = [
  { value: "ft10", label: "First to 10", sub: "Standard race" },
  { value: "ft5", label: "First to 5", sub: "Short race" },
  { value: "ft15", label: "First to 15", sub: "Long race" },
];

export default function NewBattle({ user, modQueueCount }: Props) {
  const router = useRouter();
  const [format, setFormat] = useState<MatchFormat>("ft10");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const view = await pvpClient.createMatch(format, { kind: "top_default" });
      router.push(`/play/b/${view.match.room_code}`);
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message ?? "Failed to open lobby");
    }
  };

  const target = format === "ft5" ? 5 : format === "ft15" ? 15 : 10;

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="New battle — Opening Wiki">
      <Head><meta name="description" content="Open a 1v1 PvP lobby." /></Head>
      <div style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", fontFamily: SOLO.sans }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 40px 48px" }}>
          <nav style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em", marginBottom: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <Link href="/play" style={{ color: SOLO.fg2, textDecoration: "none" }}>Play</Link>
            <span style={{ color: SOLO.fg4 }}>/</span>
            <span style={{ color: SOLO.fg2 }}>New battle</span>
          </nav>
          <h1 style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 36, letterSpacing: "-0.03em", lineHeight: 1 }}>
            New <span style={{ color: SOLO.accent }}>battle.</span>
          </h1>
          <p style={{ margin: "0 0 28px", color: SOLO.fg3, fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.04em" }}>
            1v1 race · configure → invite → play
          </p>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: SOLO.fg3 }}>
                  Format <span style={{ color: SOLO.accent }}>*</span>
                </label>
                <div style={{ display: "flex", border: `1px solid ${SOLO.line2}`, borderRadius: 8, background: SOLO.bg2, padding: 4, gap: 2 }}>
                  {FORMATS.map((f) => {
                    const on = f.value === format;
                    return (
                      <button
                        key={f.value}
                        type="button"
                        onClick={() => setFormat(f.value)}
                        style={{
                          flex: 1, padding: "10px 14px", borderRadius: 5,
                          color: on ? SOLO.accent : SOLO.fg3,
                          background: on ? "rgba(167,139,250,.08)" : "transparent",
                          border: 0,
                          boxShadow: on ? `inset 0 0 0 1px ${SOLO.accent}` : "none",
                          fontSize: 13, fontFamily: SOLO.sans, lineHeight: 1.3,
                          display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2,
                          cursor: "pointer", textAlign: "left",
                        }}
                      >
                        {f.label}
                        <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: on ? SOLO.accent : SOLO.fg4, letterSpacing: "0.04em" }}>{f.sub}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: SOLO.fg3 }}>
                  Clip pool
                </label>
                <div style={{
                  background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 8, padding: 14,
                  display: "flex", alignItems: "center", gap: 14,
                }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 8, background: SOLO.bg3,
                    border: `1px solid ${SOLO.line}`, display: "grid", placeItems: "center",
                    color: SOLO.accent, fontFamily: SOLO.mono, fontSize: 18, flexShrink: 0,
                  }}>★</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: SOLO.fg, marginBottom: 2 }}>
                      Default · Top 1,000 most-rated OPs
                    </div>
                    <div style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3 }}>
                      Auto-refreshed nightly
                    </div>
                  </div>
                </div>
                <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.04em", lineHeight: 1.4 }}>
                  Custom group pools coming later — MVP plays from the top-1000 default.
                </span>
              </div>

              {error && (
                <div style={{
                  background: "rgba(255,107,122,.06)", border: `1px solid rgba(255,107,122,.3)`,
                  borderRadius: 8, padding: "12px 14px", color: SOLO.fg, fontSize: 13,
                }}>{error}</div>
              )}
            </div>

            <aside style={{
              position: "sticky", top: 80, background: SOLO.bg2, border: `1px solid ${SOLO.line2}`,
              borderRadius: 10, padding: 22, alignSelf: "start",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${SOLO.line}` }}>
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: SOLO.fg }}>
                  Battle summary
                  <span style={{ display: "block", fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginTop: 3 }}>
                    draft · not saved
                  </span>
                </h4>
              </div>
              <SumRow k="Format" v={`First to ${target}`} />
              <SumRow k="Mode" v="Audio" />
              <SumRow k="Pool" v="Top 1,000 OPs" />
              <SumRow k="Players" v="1 / 2" mono />
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  onClick={open}
                  disabled={submitting}
                  style={{
                    background: SOLO.accent, color: SOLO.bg, border: "none", borderRadius: 8,
                    padding: "14px 22px", fontWeight: 600, fontSize: 14, cursor: submitting ? "wait" : "pointer",
                    boxShadow: `0 0 30px ${SOLO.accent}55`,
                  }}
                >
                  {submitting ? "Opening…" : "Open lobby →"}
                </button>
                <Link href="/play" style={{
                  background: "transparent", border: "none", color: SOLO.fg2,
                  padding: "10px 16px", borderRadius: 7, fontSize: 13, fontFamily: SOLO.sans,
                  textAlign: "center", textDecoration: "none",
                }}>Cancel</Link>
              </div>
              <div style={{ marginTop: 14, fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.04em", textAlign: "center" }}>
                Invite a friend once the lobby is open
              </div>
            </aside>
          </div>
        </div>
      </div>
    </Layout>
  );
}

function SumRow({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "9px 0", borderBottom: `1px dashed ${SOLO.line}`, fontSize: 13 }}>
      <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.08em", textTransform: "uppercase" }}>{k}</span>
      <span style={{ color: SOLO.fg, fontWeight: mono ? 400 : 500, fontFamily: mono ? SOLO.mono : SOLO.sans, fontSize: mono ? 12 : 13 }}>{v}</span>
    </div>
  );
}
