"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { STATUS_LABELS, type ProjectStatus } from "@/types/project";
import { chipActive, chipIdle, menu, menuItem } from "./styles";

export type StatusFilter = ProjectStatus | "all";

interface ProjectToolbarProps {
  value: StatusFilter;
  onChange: (value: StatusFilter) => void;
  /** Statuses present in the dataset; the filter only offers these. */
  availableStatuses: ProjectStatus[];
}

export function ProjectToolbar({ value, onChange, availableStatuses }: ProjectToolbarProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtering = value !== "all";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={!filtering}
        onClick={() => onChange("all")}
        className={filtering ? chipIdle : chipActive}
      >
        All projects
      </button>

      <div className="relative" ref={rootRef}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => setOpen((current) => !current)}
          className={filtering ? chipActive : chipIdle}
        >
          {filtering ? `Status: ${STATUS_LABELS[value]}` : "Filter projects"}
        </button>

        {open && (
          <div id={menuId} role="menu" className={`${menu} left-0`}>
            {availableStatuses.map((status) => (
              <button
                key={status}
                type="button"
                role="menuitemradio"
                aria-checked={value === status}
                onClick={() => {
                  onChange(status);
                  setOpen(false);
                }}
                className={`${menuItem} ${value === status ? "font-semibold" : ""}`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        )}
      </div>

      <Link href="/registration" className={chipIdle}>
        Register project <span aria-hidden="true">+</span>
      </Link>
    </div>
  );
}
