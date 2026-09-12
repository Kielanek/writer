import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CreateProjectForm } from "@/components/projects/create-project-form";

export default function NewProjectPage() {
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
        <h1 className="text-2xl font-bold tracking-tight">New Project</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Give your project a name and, optionally, a short description of what it&apos;s for.
        </p>
      </div>

      <CreateProjectForm />
    </main>
  );
}
