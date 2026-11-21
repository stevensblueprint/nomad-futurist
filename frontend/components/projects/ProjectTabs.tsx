import Link from "next/link";
import { chipActive, chipIdle } from "./styles";

export type ProjectTab = "overview" | "tasks";

const TABS: { id: ProjectTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "tasks", label: "Tasks" },
];

export function parseProjectTab(value: string | string[] | undefined): ProjectTab {
  return value === "tasks" ? "tasks" : "overview";
}

/** URL-driven tabs (`?tab=`) so each tab is linkable and renders on the server. */
export function ProjectTabs({ projectId, active }: { projectId: string; active: ProjectTab }) {
  return (
    <nav aria-label="Project sections" className="flex flex-wrap gap-2">
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.id === "overview" ? `/projects/${projectId}` : `/projects/${projectId}?tab=${tab.id}`}
            aria-current={isActive ? "page" : undefined}
            className={isActive ? chipActive : chipIdle}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
