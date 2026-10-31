"use client";

import { useState } from "react";
import { Project } from "@/types/project";
import { ProjectStatusBadge } from "./ProjectStatusBadge";

interface ProjectCardProps {
  project: Project;
  index?: number;
  showScore?: boolean;
  onEdit?: (project: Project) => void;
  onInvite?: (project: Project) => void;
  onDelete?: (project: Project) => void;
}

export function ProjectCard({
  project,
  index = 0,
  showScore = false,
  onEdit,
  onInvite,
  onDelete,
}: ProjectCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Alternating background colors based on card index (#B67947 for even, #E5BD9C for odd)
  const isEven = index % 2 === 0;
  const bgColor = isEven ? "bg-[#B67947]" : "bg-[#E5BD9C]";

  return (
    <div
      className={`flex flex-col justify-between rounded-lg border border-black/10 shadow-sm ${bgColor}`}
    >
      <div className="p-4">
        {/* Header: Project Title & Context Options Menu */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-[#022C3F]">
              {project.projectName}
            </h3>
            <p className="text-sm text-[#022C3F]/70">
              {project.registeredAt} • By {project.founderName}
            </p>
          </div>

          <div className="relative">
            {/* 3-Dots Menu Button */}
            <button
              type="button"
              aria-label="Project options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="rounded p-1 text-[#022C3F] hover:bg-black/10"
            >
              •••
            </button>

            {/* Dropdown Options */}
           {/* Dropdown Options */}
{menuOpen && (
  <div
    role="menu"
    className="absolute right-0 top-8 z-10 min-w-[10rem] overflow-hidden rounded-md border border-slate-200 bg-white py-1 text-sm shadow-md font-sans"
  >
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setMenuOpen(false);
        onEdit?.(project);
      }}
      className="block w-full px-4 py-2 text-left text-slate-800 hover:bg-slate-100 font-sans"
    >
      Edit project
    </button>
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setMenuOpen(false);
        onInvite?.(project);
      }}
      className="block w-full px-4 py-2 text-left text-slate-800 hover:bg-slate-100 font-sans"
    >
      Invite user
    </button>
    <button
      type="button"
      role="menuitem"
      onClick={() => {
        setMenuOpen(false);
        onDelete?.(project);
      }}
      className="block w-full px-4 py-2 text-left text-red-600 hover:bg-red-50"
    >
      Delete project
    </button>
  </div>
)}
          </div>
        </div>

        {/* Status Badge */}
        <div className="mt-2">
          <ProjectStatusBadge status={project.status} />
        </div>

        {/* Project Description Summary */}
        <p className="mt-3 text-sm text-[#022C3F]">{project.summary}</p>
      </div>

      {/* Metadata Footer */}
      <div className="flex items-center justify-between border-t border-black/10 px-4 py-3 text-xs text-[#022C3F]">
        <span>Seek: {project.projectFlag}</span>

        <div className="flex items-center gap-3">
          {showScore && project.score !== undefined && (
            <span>Score: {project.score}/10</span>
          )}
          <span>Reg: {project.registeredAt}</span>
        </div>
      </div>
    </div>
  );
}