import Link from "next/link";
import { STAGE_LABELS, SUPPORT_TYPE_LABELS, type Project } from "@/types/project";
import { formatDate } from "@/lib/format";
import { ProjectStatusBadge } from "./ProjectStatusBadge";
import { card, primaryButton } from "./styles";

export function ProjectInfoPanel({ project }: { project: Project }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Owner", value: project.ownerName },
    { label: "Status", value: <ProjectStatusBadge status={project.status} /> },
    { label: "Stage", value: STAGE_LABELS[project.stage] },
    { label: "Support requested", value: SUPPORT_TYPE_LABELS[project.supportType] },
    { label: "Started", value: formatDate(project.startedAt) },
    { label: "Target date", value: project.targetDate ? formatDate(project.targetDate) : "Not set" },
  ];

  return (
    <section aria-labelledby="project-info-heading" className={`${card} p-6`}>
      <h2 id="project-info-heading" className="font-heading text-lg font-semibold text-nf-navy">
        Project information
      </h2>

      <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-xs text-nf-muted">{row.label}</dt>
            <dd className="mt-0.5 text-sm text-nf-ink">{row.value}</dd>
          </div>
        ))}
        <div className="sm:col-span-2">
          <dt className="text-xs text-nf-muted">Project description</dt>
          <dd className="mt-0.5 text-sm leading-relaxed text-nf-ink">{project.description}</dd>
        </div>
      </dl>

      <Link href={`/projects/${project.projectId}?tab=tasks`} className={`${primaryButton} mt-6`}>
        View project tasks <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}
