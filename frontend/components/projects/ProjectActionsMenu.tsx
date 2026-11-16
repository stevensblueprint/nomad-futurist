"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Project } from "@/types/project";
import { menu, menuItem } from "./styles";

export interface ProjectActionHandlers {
  onEdit?: (project: Project) => void;
  onInvite?: (project: Project) => void;
  onArchive?: (project: Project) => void;
}

interface ProjectActionsMenuProps extends ProjectActionHandlers {
  project: Project;
  /** Visible trigger label, e.g. "More actions" or "Project actions". */
  label: string;
  triggerClassName: string;
  align?: "left" | "right";
}

/**
 * Secondary actions for a project. The validation form link is always available;
 * other items render only when a handler is supplied, so the menu never offers
 * actions the surrounding page cannot fulfil yet.
 */
export function ProjectActionsMenu({
  project,
  label,
  triggerClassName,
  align = "left",
  onEdit,
  onInvite,
  onArchive,
}: ProjectActionsMenuProps) {
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

  function run(handler?: (project: Project) => void) {
    setOpen(false);
    handler?.(project);
  }

  return (
    <div className="relative inline-block" ref={rootRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        {label}
      </button>

      {open && (
        <div id={menuId} role="menu" className={`${menu} ${align === "right" ? "right-0" : "left-0"}`}>
          <Link
            href={`/validation/${project.projectId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className={menuItem}
          >
            Open validation form
          </Link>
          {onEdit && (
            <button type="button" role="menuitem" onClick={() => run(onEdit)} className={menuItem}>
              Edit project details
            </button>
          )}
          {onInvite && (
            <button type="button" role="menuitem" onClick={() => run(onInvite)} className={menuItem}>
              Invite a collaborator
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              role="menuitem"
              onClick={() => run(onArchive)}
              className={`${menuItem} text-nf-error`}
            >
              Archive project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
