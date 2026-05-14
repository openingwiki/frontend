import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount?: number;
}

const HOME_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" />
  </svg>
);
const PLAY_ICON = (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const SUBS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" />
    <path d="M9 14h6" /><path d="M9 17h4" />
  </svg>
);
const GROUPS_ICON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="9" r="3.5" /><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6" />
    <circle cx="17" cy="8" r="2.5" /><path d="M16 14c3 0 6 2 6 5" />
  </svg>
);
const STAR_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 16.8 5.8 21.3l2.4-7.4L2 9.4h7.6z" />
  </svg>
);
const PLUS_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const SHIELD_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6z" />
  </svg>
);
const LOGOUT_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
  </svg>
);
const LOGIN_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" />
  </svg>
);
const CLOSE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

interface Tab {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  match: (p: string) => boolean;
}

const TABS: Tab[] = [
  { key: "home",   href: "/",        label: "Home",        icon: HOME_ICON,   match: (p) => p === "/" },
  { key: "play",   href: "/play",    label: "Play",        icon: PLAY_ICON,   match: (p) => p.startsWith("/play") },
  { key: "subs",   href: "/my-submissions", label: "Submissions", icon: SUBS_ICON,   match: (p) => p.startsWith("/my-submissions") },
  { key: "groups", href: "/groups",  label: "Groups",      icon: GROUPS_ICON, match: (p) => p.startsWith("/groups") || p.startsWith("/g/") },
];

// MobileNav renders the bottom tab bar plus a slide-in drawer triggered
// from the Topbar hamburger. It's hidden via CSS on viewports > 720px;
// the desktop Topbar nav takes over there.
export default function MobileNav({ user, modQueueCount = 0 }: Props) {
  const { pathname } = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync drawer state with a global event so Topbar's hamburger can toggle
  // it without prop-drilling.
  useEffect(() => {
    const onOpen = () => setDrawerOpen(true);
    const onClose = () => setDrawerOpen(false);
    window.addEventListener("mobile-drawer-open", onOpen);
    window.addEventListener("mobile-drawer-close", onClose);
    return () => {
      window.removeEventListener("mobile-drawer-open", onOpen);
      window.removeEventListener("mobile-drawer-close", onClose);
    };
  }, []);

  // Close the drawer whenever the route changes so it doesn't stay open
  // while the user is reading the new page.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  const close = () => setDrawerOpen(false);
  const isMod = user?.role === "moderator" || user?.role === "admin";
  const initials = user ? user.display_name.slice(0, 2).toUpperCase() : "";

  return (
    <>
      {/* Bottom tab bar */}
      <nav className="mtabbar" aria-label="Primary">
        {TABS.map((t) => {
          const on = t.match(pathname);
          return (
            <Link key={t.key} href={t.href} className={`mtab${on ? " on" : ""}`}>
              <span className="mtab-ico">{t.icon}</span>
              <span className="mtab-l">{t.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Drawer + scrim */}
      <div
        className={`mscrim${drawerOpen ? " on" : ""}`}
        onClick={close}
        aria-hidden={!drawerOpen}
      />
      <aside className={`mdrawer${drawerOpen ? " on" : ""}`} aria-hidden={!drawerOpen}>
        <div className="mdrawer-head">
          {user ? (
            <div className="mdrawer-me">
              <div className="mdrawer-avatar" aria-hidden>
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="" />
                ) : (
                  initials
                )}
              </div>
              <div className="mdrawer-me-text">
                <div className="mdrawer-me-name">
                  {user.display_name}
                  {isMod && <span className={`pill${user.role === "admin" ? " admin" : ""}`}>{user.role}</span>}
                </div>
                <div className="mdrawer-me-sub">@{user.display_name.toLowerCase()}</div>
              </div>
            </div>
          ) : (
            <div className="mdrawer-me">
              <div className="mdrawer-me-text">
                <div className="mdrawer-me-name">Welcome</div>
                <div className="mdrawer-me-sub">Sign in to play and rate</div>
              </div>
            </div>
          )}
          <button className="mdrawer-x" onClick={close} aria-label="Close menu">
            {CLOSE_ICON}
          </button>
        </div>

        <nav className="mdrawer-nav">
          <div className="mdrawer-section">Browse</div>
          <Link href="/" className={pathname === "/" ? "cur" : undefined}>
            <span className="mdrawer-ico">{HOME_ICON}</span>
            Home
          </Link>
          <Link href="/groups" className={pathname.startsWith("/groups") ? "cur" : undefined}>
            <span className="mdrawer-ico">{GROUPS_ICON}</span>
            Groups
          </Link>
          <Link href="/play" className={pathname.startsWith("/play") ? "cur" : undefined}>
            <span className="mdrawer-ico">{PLAY_ICON}</span>
            Play
          </Link>

          {user && (
            <>
              <div className="mdrawer-section">You</div>
              <Link href="/my-submissions">
                <span className="mdrawer-ico">{SUBS_ICON}</span>
                My submissions
              </Link>
              <Link href="/me">
                <span className="mdrawer-ico">{STAR_ICON}</span>
                My ratings
              </Link>
              <Link href="/submit">
                <span className="mdrawer-ico">{PLUS_ICON}</span>
                Submit an entry
              </Link>
            </>
          )}

          {isMod && (
            <>
              <div className="mdrawer-section">Moderation</div>
              <Link href="/mod/queue">
                <span className="mdrawer-ico">{SHIELD_ICON}</span>
                Moderation queue
                {modQueueCount > 0 && <span className="mdrawer-badge">{modQueueCount}</span>}
              </Link>
            </>
          )}

          <div className="mdrawer-section">Account</div>
          {user ? (
            <Link href="/api/v1/auth/logout">
              <span className="mdrawer-ico">{LOGOUT_ICON}</span>
              Log out
            </Link>
          ) : (
            <>
              <Link href="/login">
                <span className="mdrawer-ico">{LOGIN_ICON}</span>
                Log in
              </Link>
              <Link href="/signup">
                <span className="mdrawer-ico">{PLUS_ICON}</span>
                Sign up
              </Link>
            </>
          )}
        </nav>

        <div className="mdrawer-foot">
          <span>Opening Wiki · v0.2</span>
          <Link href="/about">About</Link>
        </div>
      </aside>
    </>
  );
}
