import type { GetServerSideProps } from "next";
import { useState } from "react";
import { useRouter } from "next/router";
import Layout from "@/components/Layout";
import { loadSession } from "@/lib/session";
import type { TrackKind, User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const session = await loadSession(ctx);
  if (!session.user) {
    return { redirect: { destination: "/login?next=/submit", permanent: false } };
  }
  return {
    props: { user: session.user, modQueueCount: session.modQueueCount },
  };
};

const KIND_OPTIONS: { value: TrackKind; label: string; sub: string }[] = [
  { value: "opening", label: "Opening", sub: "OP · INTRO" },
  { value: "ending",  label: "Ending",  sub: "ED · OUTRO" },
  { value: "ost",     label: "OST",     sub: "OST · TRACK" },
];

const KIND_TITLES: Record<TrackKind, string> = {
  opening: "Submit an opening",
  ending:  "Submit an ending",
  ost:     "Submit an OST",
};

const TITLE_LABELS: Record<TrackKind, string> = {
  opening: "Opening title",
  ending:  "Ending title",
  ost:     "Track title",
};

export default function SubmitPage({ user, modQueueCount }: Props) {
  const router = useRouter();
  const error = typeof router.query.error === "string" ? router.query.error : null;
  const [kind, setKind] = useState<TrackKind>("opening");

  return (
    <Layout user={user} modQueueCount={modQueueCount} title={KIND_TITLES[kind]}>
      <div className="formpage">
        <h1>{KIND_TITLES[kind]}</h1>
        <p>Goes to the moderation queue. Mods/admins are auto-approved.</p>
        {error && <p className="mock-notice">{error}</p>}
        <form action="/api/openings" method="post">
          <div>
            <label>Type</label>
            <div className="kind-picker">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`kind-btn${kind === opt.value ? " on" : ""}`}
                  onClick={() => setKind(opt.value)}
                >
                  <span className="kind-btn-label">{opt.label}</span>
                  <span className="kind-btn-sub">{opt.sub}</span>
                </button>
              ))}
            </div>
            <input type="hidden" name="kind" value={kind} />
          </div>
          <div>
            <label htmlFor="title">{TITLE_LABELS[kind]}</label>
            <input id="title" name="title" required />
          </div>
          <div>
            <label htmlFor="youtube_url">YouTube URL</label>
            <input
              id="youtube_url"
              name="youtube_url"
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
            />
          </div>
          <div>
            <label htmlFor="anime">Anime</label>
            <input id="anime" name="anime" required placeholder="Existing or new anime name" />
          </div>
          <div>
            <label htmlFor="singer">Singer / Composer</label>
            <input id="singer" name="singer" required placeholder="Existing or new artist name" />
          </div>
          <div className="actions">
            <button type="submit" className="btn primary">Submit for review</button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
