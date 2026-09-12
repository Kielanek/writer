import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getProject } from "@/lib/db/projects";
import { listChatMessages } from "@/lib/db/chat";
import { AskProjectChat } from "@/components/chat/ask-project-chat";

export const dynamic = "force-dynamic";

export default async function AskProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const messages = await listChatMessages(projectId);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6">
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Project
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ask Project</h1>
        <p className="mt-1 text-sm text-muted-foreground">{project.name}</p>
      </div>

      <AskProjectChat projectId={projectId} initialMessages={messages} />
    </main>
  );
}
