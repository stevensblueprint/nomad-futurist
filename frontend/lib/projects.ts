import type { Project } from "@/types/project";
import { MOCK_PROJECTS } from "./mockProjects";

/**
 * Data-access seam for the My Projects dashboard.
 *
 * Both functions currently resolve from the hard-coded mock dataset. Once the
 * projects API is available they should call
 * `${NEXT_PUBLIC_PROJECT_API_URL}/projects` with the Cognito ID token, leaving
 * the pages and components unchanged.
 */
export async function getMyProjects(): Promise<Project[]> {
  return MOCK_PROJECTS;
}

export async function getProject(projectId: string): Promise<Project | undefined> {
  const projects = await getMyProjects();
  return projects.find((project) => project.projectId === projectId);
}
