import Link from "next/link";
import type { User } from "@/lib/types";

interface Props {
  user: User | null;
  modQueueCount: number;
}

// Renders only for moderator/admin roles. Hidden entirely for anon/user.
export default function Rolebar({ user, modQueueCount }: Props) {
  if (!user || (user.role !== "moderator" && user.role !== "admin")) return null;

  const isAdmin = user.role === "admin";

  return (
    <div className="rolebar">
      <div className="wrap rolebar-inner">
        <span className={`pill${isAdmin ? " admin" : ""}`}>{user.role.toUpperCase()}</span>
        <Link href="/mod/queue">
          Moderation queue{" "}
          <span className="count">{modQueueCount} pending</span>
        </Link>
        {isAdmin && (
          <span style={{ marginLeft: "auto" }}>
            <Link href="/admin/users">User management →</Link>
          </span>
        )}
      </div>
    </div>
  );
}
