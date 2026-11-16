import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, within, fireEvent, cleanup } from "@testing-library/react";
import type { Project } from "../types/project";
import ProjectsDashboard from "../app/(protected)/projects/ProjectsDashboard";
import { ProjectCard } from "../components/projects/ProjectCard";
import { MOCK_PROJECTS } from "../lib/mockProjects";
import { formatDate } from "../lib/format";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/projects",
}));

afterEach(() => cleanup());

const baseProject: Project = {
  projectId: "p-1",
  projectName: "Test Project",
  summary: "A one-line summary.",
  description: "A longer description.",
  ownerName: "Alex Kim",
  ownerEmail: "alex@example.com",
  supportType: "funding",
  status: "under_review",
  stage: "validation",
  progress: 30,
  startedAt: "2026-11-04",
  targetDate: "2027-02-28",
  updatedAt: "2026-11-14T00:00:00Z",
};

describe("ProjectCard", () => {
  it("renders the project details, status, stage, dates and progress", () => {
    render(<ProjectCard project={baseProject} />);

    expect(screen.getByRole("heading", { name: "Test Project" })).toBeInTheDocument();
    expect(screen.getByText("A one-line summary.")).toBeInTheDocument();
    expect(screen.getByText("Under review")).toBeInTheDocument();
    expect(screen.getByText("Validation")).toBeInTheDocument();
    expect(screen.getByText("Alex Kim")).toBeInTheDocument();
    expect(screen.getByText("4 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("28 Feb 2027")).toBeInTheDocument();

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByRole("link", { name: /open project overview/i })).toHaveAttribute(
      "href",
      "/projects/p-1",
    );
    expect(screen.getByRole("link", { name: "Tasks" })).toHaveAttribute("href", "/projects/p-1?tab=tasks");
  });

  it("omits the progress bar when progress is not tracked", () => {
    render(<ProjectCard project={{ ...baseProject, progress: undefined }} />);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("marks sample records and only offers actions that have handlers", () => {
    const onEdit = vi.fn();
    render(<ProjectCard project={{ ...baseProject, isSample: true }} onEdit={onEdit} />);

    // Eyebrow label and progress readout both flag the record as sample data.
    expect(screen.getAllByText(/sample/i)).toHaveLength(2);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", "30% (sample)");

    fireEvent.click(screen.getByRole("button", { name: "More actions" }));
    const menu = screen.getByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /validation form/i })).toHaveAttribute(
      "href",
      "/validation/p-1",
    );
    expect(within(menu).queryByRole("menuitem", { name: /invite/i })).toBeNull();

    fireEvent.click(within(menu).getByRole("menuitem", { name: /edit project/i }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ projectId: "p-1" }));
  });
});

describe("ProjectsDashboard", () => {
  it("renders one card per project from the dataset", () => {
    render(<ProjectsDashboard projects={MOCK_PROJECTS} />);

    const list = screen.getByRole("list", { name: "Your projects" });
    expect(within(list).getAllByRole("article")).toHaveLength(MOCK_PROJECTS.length);
    for (const project of MOCK_PROJECTS) {
      expect(within(list).getByRole("heading", { name: project.projectName })).toBeInTheDocument();
    }
  });

  it("filters by status and can clear the filter", () => {
    render(<ProjectsDashboard projects={MOCK_PROJECTS} />);

    fireEvent.click(screen.getByRole("button", { name: "Filter projects" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Approved" }));

    const approved = MOCK_PROJECTS.filter((p) => p.status === "approved");
    expect(screen.getAllByRole("article")).toHaveLength(approved.length);
    expect(screen.getByRole("button", { name: "Status: Approved" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "All projects" }));
    expect(screen.getAllByRole("article")).toHaveLength(MOCK_PROJECTS.length);
  });

  it("shows the empty state with a registration link when there are no projects", () => {
    render(<ProjectsDashboard projects={[]} />);

    expect(screen.getByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /register your first project/i })).toHaveAttribute(
      "href",
      "/registration",
    );
    expect(screen.queryByRole("button", { name: "Filter projects" })).toBeNull();
  });
});

describe("formatDate", () => {
  it("formats ISO dates as day month year", () => {
    expect(formatDate("2026-11-04")).toBe("4 Nov 2026");
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});
