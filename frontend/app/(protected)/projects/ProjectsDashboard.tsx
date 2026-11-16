"use client";

import { useMemo, useState } from "react";
import type { Project, ProjectStatus } from "@/types/project";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectToolbar, type StatusFilter } from "@/components/projects/ProjectToolbar";
import { EmptyState } from "@/components/projects/EmptyState";
import { chipIdle } from "@/components/projects/styles";

export default function ProjectsDashboard({ projects }: { projects: Project[] }) {
  const [filter, setFilter] = useState<StatusFilter>("all");

  const availableStatuses = useMemo(
    () => Array.from(new Set(projects.map((p) => p.status))) as ProjectStatus[],
    [projects],
  );

  const visible = useMemo(
    () => (filter === "all" ? projects : projects.filter((p) => p.status === filter)),
    [projects, filter],
  );

  const hasProjects = projects.length > 0;

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:px-10 lg:py-10">
      <header className="mb-8">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-nf-navy lg:text-[32px]">
          My projects
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-nf-muted">
          Your projects, progress and next steps. The Portal remains your home for industry updates.
        </p>
      </header>

      {hasProjects && (
        <div className="mb-8">
          <ProjectToolbar value={filter} onChange={setFilter} availableStatuses={availableStatuses} />
        </div>
      )}

      {!hasProjects ? (
        <EmptyState />
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-nf-border bg-white px-6 py-12 text-center">
          <p className="text-sm text-nf-muted">No projects match this filter.</p>
          <button type="button" onClick={() => setFilter("all")} className={`${chipIdle} mt-4`}>
            Show all projects
          </button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3" aria-label="Your projects">
          {visible.map((project) => (
            <li key={project.projectId} className="flex">
              <ProjectCard project={project} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
