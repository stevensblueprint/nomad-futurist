import type { Metadata } from "next";
import { getMyProjects } from "@/lib/projects";
import ProjectsDashboard from "./ProjectsDashboard";

export const metadata: Metadata = { title: "My projects · Nomad Incubator" };

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  // Development aid for reviewing the empty state: /projects?empty=1
  const previewEmpty = process.env.NODE_ENV !== "production" && params.empty === "1";
  const projects = previewEmpty ? [] : await getMyProjects();

  return <ProjectsDashboard projects={projects} />;
}
