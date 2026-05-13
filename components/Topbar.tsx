import Link from "next/link";
import { useRouter } from "next/router";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
}

type NavItem = { href: string; label: string; match: (p: string) => boolean };

const BASE_NAV: NavItem[] = [
  { href: "/",       label: "Home",   match: (p: string) => p === "/" },
  { href: "/play",   label: "Play",   match: (p: string) => p.startsWith("/play") },
  { href: "/groups", label: "Groups", match: (p: string) => p.startsWith("/groups") || p.startsWith("/g/") },
];

const ME_SUBMISSIONS_ITEM: NavItem = {
  href: "/my-submissions",
  label: "My submissions",
  match: (p: string) => p.startsWith("/my-submissions"),
};

export default function Topbar({ user }: Props) {
  const { pathname } = useRouter();
  // Slot "My submissions" between Play and Groups for authenticated
  // users so it sits next to the other gameplay-adjacent entries
  // rather than buried inside the avatar menu.
  const nav = user ? [...BASE_NAV.slice(0, 2), ME_SUBMISSIONS_ITEM, ...BASE_NAV.slice(2)] : BASE_NAV;

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>opening<em>·</em>wiki</span>
        </Link>

        <nav className="nav">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={item.match(pathname) ? "active" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="top-right">
          {user ? (
            <>
              <Link href="/submit" className="btn primary sm">+ Submit</Link>
              <Link href="/me" className="topbar-me">
              <span className="topbar-avatar" aria-hidden>
                {user.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatar_url} alt="" />
                ) : (
                  user.display_name.slice(0, 2).toUpperCase()
                )}
              </span>
              <span className="topbar-name">{user.display_name}</span>
            </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn ghost">Log in</Link>
              <Link href="/signup" className="btn primary">Sign up</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
