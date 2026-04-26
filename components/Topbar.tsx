import Link from "next/link";
import { useRouter } from "next/router";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
}

const NAV = [
  { href: "/",        label: "Home",    match: (p: string) => p === "/" },
  { href: "/anime",   label: "Anime",   match: (p: string) => p.startsWith("/anime") },
  { href: "/singers", label: "Singers", match: (p: string) => p.startsWith("/singers") },
  { href: "/groups",  label: "Groups",  match: (p: string) => p.startsWith("/groups") || p.startsWith("/g/") },
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
            <Link href="/me" className="btn ghost sm">
              {user.display_name}
            </Link>
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
