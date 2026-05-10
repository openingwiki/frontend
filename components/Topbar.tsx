import Link from "next/link";
import { useRouter } from "next/router";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
}

const NAV = [
  { href: "/",       label: "Home",   match: (p: string) => p === "/" },
  { href: "/groups", label: "Groups", match: (p: string) => p.startsWith("/groups") || p.startsWith("/g/") },
];

export default function Topbar({ user }: Props) {
  const { pathname } = useRouter();

  return (
    <header className="topbar">
      <div className="wrap topbar-inner">
        <Link href="/" className="brand">
          <span className="brand-mark" />
          <span>opening<em>·</em>wiki</span>
        </Link>

        <nav className="nav">
          {NAV.map((item) => (
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
