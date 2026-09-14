import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { listMyPendingInvitations, resolveProjectNames, resolveUserEmails } from "@/lib/db/collaboration";
import { InvitationsList } from "@/components/projects/invitations-list";

export const dynamic = "force-dynamic";

export default async function InvitationsPage() {
  const invitations = await listMyPendingInvitations();

  const [projectNames, inviterEmails] = await Promise.all([
    resolveProjectNames(invitations.map((inv) => inv.project_id)),
    resolveUserEmails(invitations.map((inv) => inv.invited_by)),
  ]);

  const items = invitations.map((inv) => ({
    ...inv,
    projectName: projectNames.get(inv.project_id) ?? "(deleted project)",
    invitedByEmail: inviterEmails.get(inv.invited_by) ?? null,
  }));

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Projects
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Project Invitations</h1>
        <p className="mt-1 text-sm text-muted-foreground">Projects other people have shared with you.</p>
      </div>

      <InvitationsList initialInvitations={items} />
    </main>
  );
}
