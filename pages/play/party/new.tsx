import Head from "next/head";
import Link from "next/link";
import type { GetServerSideProps } from "next";
import { useRouter } from "next/router";
import { useState } from "react";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import { SOLO, Eyebrow } from "@/components/solo/atoms";
import { partyClient } from "@/lib/party";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/play/party/new", permanent: false } };
  }
  return { props: { user: session.user, modQueueCount: session.modQueueCount } };
};

const ROUNDS_OPTIONS = [
  { value: 5,  label: "5 rounds",  sub: "Quick party" },
  { value: 10, label: "10 rounds", sub: "Standard" },
  { value: 20, label: "20 rounds", sub: "Long party" },
];

export default function NewParty({ user, modQueueCount }: Props) {
  const router = useRouter();
  const [rounds, setRounds] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const view = await partyClient.createRoom(rounds, { kind: "top_default" });
      router.push(`/play/p/${encodeURIComponent(view.room.room_code)}`);
    } catch (err: any) {
      setSubmitting(false);
      setError(err?.message ?? "Failed to open room");
    }
  };

  return (
    <Layout user={user} modQueueCount={modQueueCount} title="New party — Opening Wiki">
      <Head><meta name="description" content="Open an unlimited-player party room." /></Head>
      <div data-mobile-party-new style={{ background: SOLO.bg, color: SOLO.fg, minHeight: "calc(100vh - 60px)", fontFamily: SOLO.sans }}>
        <div className="solo-page" style={{ maxWidth: 1120, margin: "0 auto", padding: "36px 40px 48px" }}>
          <nav style={{ fontFamily: SOLO.mono, fontSize: 11, color: SOLO.fg3, letterSpacing: "0.04em", marginBottom: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <Link href="/play" style={{ color: SOLO.fg2, textDecoration: "none" }}>Play</Link>
            <span style={{ color: SOLO.fg4 }}>/</span>
            <span style={{ color: SOLO.fg2 }}>New party</span>
          </nav>
          <h1 style={{ margin: "0 0 6px", fontWeight: 800, fontSize: 36, letterSpacing: "-0.03em", lineHeight: 1 }}>
            New <span style={{ color: SOLO.accent }}>party.</span>
          </h1>
          <p style={{ margin: "0 0 28px", color: SOLO.fg3, fontFamily: SOLO.mono, fontSize: 11, letterSpacing: "0.04em" }}>
            unlimited players · same clip · speed wins points
          </p>

          <div className="pvp-grid" style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 28 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <label style={{ fontFamily: SOLO.mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: SOLO.fg3 }}>
                  Rounds <span style={{ color: SOLO.accent }}>*</span>
                </label>
                <div className="pvp-format" style={{ display: "flex", border: `1px solid ${SOLO.line2}`, borderRadius: 8, background: SOLO.bg2, padding: 4, gap: 2 }}>
                  {ROUNDS_OPTIONS.map((opt) => {
                    const on = opt.value === rounds;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setRounds(opt.value)}
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
                        {opt.label}
                        <span style={{ fontFamily: SOLO.mono, fontSize: 10, color: on ? SOLO.accent : SOLO.fg4, letterSpacing: "0.04em" }}>{opt.sub}</span>
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
              </div>

              <div style={{
                background: SOLO.bg2, border: `1px solid ${SOLO.line}`, borderRadius: 8, padding: "14px 16px",
                display: "flex", alignItems: "flex-start", gap: 12,
              }}>
                <div style={{ color: SOLO.accent, fontSize: 18, flexShrink: 0, lineHeight: 1.2 }}>↗</div>
                <div style={{ fontSize: 13, color: SOLO.fg2, lineHeight: 1.55 }}>
                  Share the room link after creating. Everyone who joins hears the same clip in sync.
                  Fastest correct answer each round scores the most points.
                </div>
              </div>

              {error && (
                <div style={{
                  background: "rgba(255,107,122,.06)", border: `1px solid rgba(255,107,122,.3)`,
                  borderRadius: 8, padding: "12px 14px", color: SOLO.fg, fontSize: 13,
                }}>{error}</div>
              )}
            </div>

            <aside className="pvp-sidebar" style={{
              position: "sticky", top: 80, background: SOLO.bg2, border: `1px solid ${SOLO.line2}`,
              borderRadius: 10, padding: 22, alignSelf: "start",
            }}>
              <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: `1px solid ${SOLO.line}` }}>
                <h4 style={{ margin: 0, fontWeight: 700, fontSize: 18, letterSpacing: "-0.02em", color: SOLO.fg }}>
                  Party summary
                  <span style={{ display: "block", fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg3, letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 500, marginTop: 3 }}>
                    draft · not saved
                  </span>
                </h4>
              </div>
              <SumRow k="Rounds" v={String(rounds)} />
              <SumRow k="Mode" v="Audio" />
              <SumRow k="Pool" v="Top 1,000 OPs" />
              <SumRow k="Players" v="No cap" mono />
              <SumRow k="Scoring" v="Speed-based" />
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
                  {submitting ? "Opening…" : "Open party →"}
                </button>
                <Link href="/play" style={{
                  background: "transparent", border: "none", color: SOLO.fg2,
                  padding: "10px 16px", borderRadius: 7, fontSize: 13, fontFamily: SOLO.sans,
                  textAlign: "center", textDecoration: "none",
                }}>Cancel</Link>
              </div>
              <div style={{ marginTop: 14, fontFamily: SOLO.mono, fontSize: 10, color: SOLO.fg4, letterSpacing: "0.04em", textAlign: "center" }}>
                Share the link once the room is open
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
