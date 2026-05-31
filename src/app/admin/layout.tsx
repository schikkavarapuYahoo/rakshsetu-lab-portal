import { redirect } from "next/navigation";

import { AdminHeader } from "@/components/layout/admin-header";
import { getSession } from "@/server/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) redirect("/staff-login");
  if (session.role === "lab") redirect("/");

  // Root layout wraps everything in `<main className="px-4 py-6 ...">`.
  // The admin console wants its sticky header flush with the viewport
  // edge, so cancel that outer padding with negative margins and
  // re-apply page-content padding inside the inner <main>.
  return (
    <div className="bg-app -mx-4 -my-6 min-h-screen sm:-mx-6 sm:-my-8">
      <AdminHeader
        displayName={session.display_name}
        email={session.email}
        role={session.role}
      />
      <main className="px-4 py-6 sm:px-6 sm:py-8">{children}</main>
    </div>
  );
}
