import { ProjectStatus } from "@/types/project";

interface StatusBadgeProps {
    status: ProjectStatus;
}

export function ProjectStatusBadge({ status } : StatusBadgeProps) {
    const getBadgeStyle = (status: ProjectStatus): string => {
        switch(status){
            case "Approved":
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case "Pending / Under Review":
                return "bg-amber-50 text-amber-700 border-amber-200";
            case "Declined":
                return "bg-rose-50 text-rose-700 border-rose-200";
            case "Archived":
                return "bg-slate-50 text-slate-700 border-slate-200";
            default:
                return "bg-gray-50 text-gray-700 border-gray-200";
        }

    };
    return (
        <span
        className = {`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getBadgeStyle(
            status
        )}`}
        >
            {status}
        </span>
    )
}