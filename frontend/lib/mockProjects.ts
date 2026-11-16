import type { Project } from "@/types/project";

/**
 * Hard-coded sample projects used until the projects API is wired up.
 * Presentation components never import this file directly; they receive
 * records through props from `lib/projects.ts`.
 */
export const MOCK_PROJECTS: Project[] = [
  {
    projectId: "proj-edgeloop",
    projectName: "EdgeLoop",
    summary: "Local edge computing for community services.",
    description:
      "Explore a small-footprint edge-computing service for community facilities. Validate the need and operating constraints before proposing a pilot.",
    ownerName: "Alex Kim",
    ownerEmail: "alex.kim@example.com",
    supportType: "both",
    status: "under_review",
    stage: "validation",
    progress: 30,
    startedAt: "2026-11-04",
    targetDate: "2027-02-28",
    updatedAt: "2026-11-14T15:20:00Z",
    isSample: true,
  },
  {
    projectId: "proj-thermaliq",
    projectName: "ThermalIQ Systems",
    summary: "Predictive thermal modelling for modular data centres.",
    description:
      "AI-assisted HVAC modelling that forecasts hot spots in modular data halls and recommends airflow changes before they affect uptime. Currently validating the model against two partner facilities.",
    ownerName: "Alex Kim",
    ownerEmail: "alex.kim@example.com",
    supportType: "funding",
    status: "approved",
    stage: "incubation",
    progress: 65,
    startedAt: "2026-08-18",
    targetDate: "2027-05-15",
    updatedAt: "2026-11-10T09:05:00Z",
    isSample: true,
  },
  {
    projectId: "proj-ecogrid",
    projectName: "EcoGrid Microturbines",
    summary: "Modular renewable power nodes for remote infrastructure.",
    description:
      "Containerised microturbine units that can be deployed alongside remote telecom and edge sites. The registration has been submitted and is waiting for an initial review.",
    ownerName: "Alex Kim",
    ownerEmail: "alex.kim@example.com",
    supportType: "human_capital",
    status: "submitted",
    stage: "registration",
    startedAt: "2026-11-12",
    updatedAt: "2026-11-12T18:40:00Z",
    isSample: true,
  },
];
