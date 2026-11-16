"use client";

import Link from "next/link";
import { STAGE_LABELS, type Project } from "@/types/project";
import { formatDate } from "@/lib/format";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { ProjectProgress } from "./ProjectProgress";
import { ProjectActionsMenu, type ProjectActionHandlers } from "./ProjectActionsMenu";
import { card, eyebrow, primaryButton, textLink } from "./styles";

interface ProjectCardProps extends ProjectActionHandlers {
  project: Project;
  /** Eyebrow label above the project name. */
  eyebrowLabel?: string;
}

export function ProjectCard({ project, eyebrowLabel = "Your project", ...handlers }: ProjectCardProps) {
  const overviewHref = `/projects/${project.projectId}`;
  const titleId = `project-${project.projectId}-title`;

  return (
    <article aria-labelledby={titleId} className={`${card} flex h-full flex-col p-5`}>
      <div className="flex items-start justify-between gap-3">
        <p className={eyebrow}>
          {eyebrowLabel}
          {project.isSample && (
            <>
              {" "}
              <span aria-hidden="true">·</span> Sample
            </>
          )}
        </p>
        <ProjectStatusBadge status={project.status} />
      </div>

      <h3 id={titleId} className="mt-2 font-heading text-lg font-semibold leading-snug text-nf-navy">
        {project.projectName}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-nf-muted">{project.summary}</p>

      <dl className="mt-4 space-y-1 text-xs text-nf-muted">
        <div className="flex gap-1">
          <dt>Owner:</dt>
          <dd className="text-nf-ink">{project.ownerName}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1">
          <dt>Stage:</dt>
          <dd className="text-nf-ink">{STAGE_LABELS[project.stage]}</dd>
        </div>
        <div className="flex flex-wrap gap-x-1">
          <dt>Started:</dt>
          <dd className="text-nf-ink">{formatDate(project.startedAt)}</dd>
          {project.targetDate && (
            <>
              <span aria-hidden="true">·</span>
              <dt>Target:</dt>
              <dd className="text-nf-ink">{formatDate(project.targetDate)}</dd>
            </>
          )}
        </div>
      </dl>

      {project.progress !== undefined && (
        <div className="mt-4">
          <ProjectProgress value={project.progress} isSample={project.isSample} />
        </div>
      )}

      <div className="mt-auto pt-5">
        <Link href={overviewHref} className={`${primaryButton} w-full`}>
          Open project overview <span aria-hidden="true">→</span>
        </Link>

        <div className="mt-3 flex items-center gap-5">
          <Link href={`${overviewHref}?tab=tasks`} className={textLink}>
            Tasks
          </Link>
          <ProjectActionsMenu project={project} label="More actions" triggerClassName={textLink} {...handlers} />
        </div>
      </div>
    </article>
  );
}
