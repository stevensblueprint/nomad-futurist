import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/projects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectInfoPanel } from "@/components/projects/ProjectInfoPanel";
import { ProjectTabs, parseProjectTab } from "@/components/projects/ProjectTabs";
import { ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
import { card, outlineButton } from "@/components/projects/styles";

type Params = Promise<{ projectId: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const project = await getProject((await params).projectId);
  return { title: project ? `${project.projectName} · My projects` : "Project not found" };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { projectId } = await params;
  const project = await getProject(projectId);
  if (!project) notFound();

  const tab = parseProjectTab((await searchParams).tab);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:px-10 lg:py-10">
      <nav aria-label="Breadcrumb" className="text-xs text-nf-muted">
        <ol className="flex items-center gap-1.5">
          <li>
            <Link href="/projects" className="hover:text-nf-navy hover:underline">
              My projects
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-nf-ink">
            {project.projectName}
          </li>
        </ol>
      </nav>

      <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-nf-navy lg:text-[32px]">
            {project.projectName}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-nf-muted">{project.summary}</p>
        </div>
        <ProjectActionsMenu
          project={project}
          label="Project actions"
          triggerClassName={outlineButton}
          align="right"
        />
      </header>

      <div className="mt-6">
        <ProjectTabs projectId={project.projectId} active={tab} />
      </div>

      {tab === "overview" ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,320px)_1fr]">
          <ProjectCard project={project} />
          <ProjectInfoPanel project={project} />
        </div>
      ) : (
        <section aria-labelledby="tasks-heading" className={`${card} mt-6 p-6`}>
          <h2 id="tasks-heading" className="font-heading text-lg font-semibold text-nf-navy">
            Tasks
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-nf-muted">
            Tasks for {project.projectName} will appear here once the incubator team assigns them.
            Until then, the validation form is the next step for this project.
          </p>
          <Link href={`/validation/${project.projectId}`} className={`${outlineButton} mt-5`}>
            Open validation form <span aria-hidden="true">→</span>
          </Link>
        </section>
      )}
    </main>
  );
}
