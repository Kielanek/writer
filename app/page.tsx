import Link from "next/link";
import { Plus, Mic, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectCard } from "@/components/projects/project-card";
import { listProjectsWithCounts } from "@/lib/db/projects";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const projects = await listProjectsWithCounts();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Button asChild variant="ghost" size="sm" className="flex-1 sm:flex-none">
            <Link href="/presets">
              <Sparkles className="size-4" />
              Writing Presets
            </Link>
          </Button>
          <Button asChild className="flex-1 sm:flex-none">
            <Link href="/projects/new">
              <Plus className="size-4" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-violet-50 text-violet-500">
            <Mic className="size-6" />
          </div>
          <div>
            <p className="font-medium">No projects yet</p>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Create a project to start collecting voice notes, audio, and ideas.
            </p>
          </div>
          <Button asChild className="mt-2">
            <Link href="/projects/new">
              <Plus className="size-4" />
              New Project
            </Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {projects.map((project) => (
            <ProjectCard key={project.id} project={project} />
          ))}
        </div>
      )}
    </main>
  );
}
