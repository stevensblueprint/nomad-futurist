"use client";

import { useState, useMemo } from "react";
import { UserRole } from "@/types/project";
import { MOCK_PROJECTS } from "@/lib/mockProjects";
import { Navbar } from "@/components/dashboard/NavBar";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { ProjectFilters } from "@/components/dashboard/ProjectFilters";
import { EmptyState } from "@/components/dashboard/EmptyState";

// Simulated Cognito user profiles for testing dynamic logged-in user state
export interface LoggedInUser {
  id: string;
  name: string;
  email: string;
  roles: UserRole[];
  avatarUrl?: string;
}

const MOCK_USERS: LoggedInUser[] = [
  {
    id: "user-1",
    name: "Alex Rivera",
    email: "alex@stevens.edu",
    roles: ["Founders"],
  },
  {
    id: "user-2",
    name: "Jordan Chen",
    email: "jordan@stevens.edu",
    roles: ["Founders"],
  },
  {
    id: "user-3",
    name: "Taylor Morgan",
    email: "taylor.new@stevens.edu", // Founder with 0 projects to test Empty State
    roles: ["Founders"],
  },
  {
    id: "user-4",
    name: "Sarah Jenkins",
    email: "s.jenkins@nomadfuturist.org",
    roles: ["Technical Staff"],
  },
];

// Testing tools are hidden automatically in production builds
const SHOW_DEV_TOOLS = process.env.NODE_ENV !== "production";

export default function ProjectDashboardPage() {
  const [currentUser, setCurrentUser] = useState<LoggedInUser>(MOCK_USERS[0]);
  const [activeRole, setActiveRole] = useState<UserRole>("Founders");
  const [selectedStatus, setSelectedStatus] = useState("All");

  // Switching users also switches the active role context
  const handleUserSwitch = (userId: string) => {
    const selectedUser = MOCK_USERS.find((u) => u.id === userId);
    if (selectedUser) {
      setCurrentUser(selectedUser);
      setActiveRole(
        selectedUser.roles.includes("Technical Staff")
          ? "Technical Staff"
          : "Founders"
      );
    }
  };

  const visibleProjects = useMemo(() => {
    if (activeRole === "Founders") {
      // Founders only see projects tied to their account email
      return MOCK_PROJECTS.filter(
        (p) => p.founderEmail.toLowerCase() === currentUser.email.toLowerCase()
      );
    }

    // Technical Staff see all projects, filtered by status
    return MOCK_PROJECTS.filter(
      (p) => selectedStatus === "All" || p.status === selectedStatus
    );
  }, [activeRole, currentUser, selectedStatus]);

  const isStaff = activeRole === "Technical Staff";

  return (
    <div className="min-h-screen bg-white">
      {/* 1. Top navigation bar */}
      <Navbar
        username={currentUser.name}
        onSignOut={() => alert(`Signed out ${currentUser.name}`)}
      />

      {/* 2. Main content */}
      <main className="mx-auto max-w-7xl px-6 py-8 md:px-12">
        {/* Welcome heading + Filter button (staff only) */}
        <section className="mb-8">
          <h1 className="font-poppins text-4xl font-bold tracking-tight text-[#022C3F]">
            Welcome, {currentUser.name}!
          </h1>

          {
            <ProjectFilters
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
            />
          }
        </section>

        {/* 3. Project grid, or the right empty state for the role */}
        {visibleProjects.length === 0 ? (
          isStaff ? (
            <div className="rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
              <p className="text-slate-600">No projects match this filter.</p>
              <button
                type="button"
                onClick={() => setSelectedStatus("All")}
                className="mt-4 rounded-full bg-[#022C3F] px-4 py-1 text-sm font-semibold text-white hover:opacity-90"
              >
                Clear filter
              </button>
            </div>
          ) : (
            <EmptyState />
          )
        ) : (
          <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
            {visibleProjects.map((project, index) => (
              <ProjectCard
                key={project.id}
                project={project}
                index={index}
                showScore={isStaff}
                onEdit={(p) => alert(`Edit ${p.projectName}`)}
                onInvite={(p) => alert(`Invite to ${p.projectName}`)}
                onDelete={(p) => {
                  if (window.confirm(`Delete ${p.projectName}?`)) {
                    alert("Deleted");
                  }
                }}
              />
            ))}
          </div>
        )}

        {/* 4. Testing tools (development only) */}
        {SHOW_DEV_TOOLS && (
          <section className="mt-16 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-slate-300 p-3 text-xs text-slate-600">
            <span className="font-semibold uppercase tracking-wider">
              Testing tools
            </span>

            <label htmlFor="user-select" className="font-semibold">
              Active user:
            </label>
            <select
              id="user-select"
              value={currentUser.id}
              onChange={(e) => handleUserSwitch(e.target.value)}
              className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-800"
            >
              {MOCK_USERS.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.roles.join(", ")})
                </option>
              ))}
            </select>

            <div className="flex rounded-md border border-slate-300 bg-slate-100 p-0.5 font-semibold">
              {(["Founders", "Technical Staff"] as UserRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setActiveRole(role)}
                  className={`rounded px-3 py-1 ${
                    activeRole === role
                      ? "bg-white text-slate-900 shadow-xs"
                      : "hover:text-slate-900"
                  }`}
                >
                  {role === "Founders" ? "Founder view" : "Staff view"}
                </button>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}