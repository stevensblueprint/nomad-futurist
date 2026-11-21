import type { SupportType } from "@/app/(protected)/registration/registration-utils";

/**
 * Lifecycle status of a registered project. Mirrors the `status` value returned by
 * the registration API (`draft`) and the states the incubator moves a project through.
 */
export type ProjectStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "declined"
  | "archived";

/** Incubation / validation stage the project is currently in. */
export type ProjectStage = "registration" | "validation" | "incubation" | "graduated";

export interface Project {
  projectId: string;
  projectName: string;
  /** One-line description shown on cards and page subtitles. */
  summary: string;
  /** Longer description shown in the project information panel. */
  description: string;
  ownerName: string;
  ownerEmail: string;
  supportType: SupportType;
  status: ProjectStatus;
  stage: ProjectStage;
  /** 0–100. Omit when progress is not tracked for the project yet. */
  progress?: number;
  /** ISO 8601 date. */
  startedAt: string;
  /** ISO 8601 date. */
  targetDate?: string;
  /** ISO 8601 date-time. */
  updatedAt: string;
  /** True for illustrative records; removed once projects come from the API. */
  isSample?: boolean;
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_review: "Under review",
  approved: "Approved",
  declined: "Declined",
  archived: "Archived",
};

export const STAGE_LABELS: Record<ProjectStage, string> = {
  registration: "Registration",
  validation: "Validation",
  incubation: "Incubation",
  graduated: "Graduated",
};

export const SUPPORT_TYPE_LABELS: Record<SupportType, string> = {
  funding: "Funding",
  human_capital: "Human capital",
  both: "Funding and human capital",
};
