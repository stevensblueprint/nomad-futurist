import { STATUS_LABELS, type ProjectStatus } from "@/types/project";

const STATUS_STYLES: Record<ProjectStatus, string> = {
  draft: "bg-nf-soft text-nf-muted ring-nf-border",
  submitted: "bg-sky-50 text-sky-800 ring-sky-200",
  under_review: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  declined: "bg-rose-50 text-rose-800 ring-rose-200",
  archived: "bg-nf-soft text-nf-muted ring-nf-border",
};

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
