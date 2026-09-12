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
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Projects</h1>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/presets">
              <Sparkles className="size-4" />
              Writing Presets
            </Link>
          </Button>
          <Button asChild>
            <Link href="/projects/new">
              <Plus className="size-4" />
              New Project
            </Link>
          </Button>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-20 text-center">
          <Mic className="size-8 text-muted-foreground" />
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
