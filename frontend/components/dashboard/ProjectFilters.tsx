"use client";

import { useState } from "react";
import { ProjectStatus } from "@/types/project";

interface ProjectFiltersProps {
  selectedStatus: string;
  onStatusChange: (status: string) => void;
}

const statuses: (ProjectStatus | "All")[] = [
  "All",
  "Pending / Under Review",
  "Approved",
  "Declined",
  "Archived",
];

export function ProjectFilters({
  selectedStatus,
  onStatusChange,
}: ProjectFiltersProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative mt-3 inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded-full bg-black px-4 py-1 text-sm font-semibold text-white transition-colors hover:bg-slate-800"
      >
        Filter{selectedStatus !== "All" ? `: ${selectedStatus}` : ""}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-10 mt-2 min-w-[14rem] overflow-hidden rounded-xl bg-neutral-200 py-1 text-sm shadow-md"
        >
          {statuses.map((status) => (
            <button
              key={status}
              type="button"
              role="menuitem"
              onClick={() => {
                onStatusChange(status);
                setOpen(false);
              }}
              className={`block w-full px-4 py-2 text-left text-slate-900 hover:bg-neutral-300 ${
                selectedStatus === status ? "font-bold" : ""
              }`}
            >
              {status === "All" ? "All Statuses" : status}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}