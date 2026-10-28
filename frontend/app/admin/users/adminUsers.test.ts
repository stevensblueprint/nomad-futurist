import { describe, expect, it } from "vitest";
import { buildUsersEndpoint, isAdmin, isProvisionRole, messageForStatus, parseGroups, PROVISION_ROLES } from "./adminUsers";

describe("parseGroups", () => {
  it("returns list claims unchanged", () => {
    expect(parseGroups(["Mentors", "Admin"])).toEqual(["Mentors", "Admin"]);
  });
  it("parses a JSON list string", () => {
    expect(parseGroups('["Admin","Mentors"]')).toEqual(["Admin", "Mentors"]);
  });
  it("parses a comma-separated string", () => {
    expect(parseGroups("Mentors, Admin")).toEqual(["Mentors", "Admin"]);
  });
  it("returns an empty list for missing or invalid claims", () => {
    expect(parseGroups(undefined)).toEqual([]);
    expect(parseGroups(null)).toEqual([]);
    expect(parseGroups(42)).toEqual([]);
    expect(parseGroups("")).toEqual([]);
    expect(parseGroups("[not-json")).toEqual([]);
  });
});

describe("isAdmin", () => {
  it("requires the exact Admin group", () => {
    expect(isAdmin(["Admin"])).toBe(true);
    expect(isAdmin("Mentors,Admin")).toBe(true);
    expect(isAdmin(["Administrator"])).toBe(false);
    expect(isAdmin(["Mentors"])).toBe(false);
  });
});

describe("roles", () => {
  it("lists the supported provision roles", () => {
    expect(PROVISION_ROLES).toEqual(["TechnicalStaff", "Mentors"]);
  });
  it("recognizes valid provision roles", () => {
    expect(isProvisionRole("TechnicalStaff")).toBe(true);
    expect(isProvisionRole("Mentors")).toBe(true);
    expect(isProvisionRole("Founders")).toBe(false);
    expect(isProvisionRole("Admin")).toBe(false);
    expect(isProvisionRole("")).toBe(false);
  });
});

describe("buildUsersEndpoint", () => {
  it("removes trailing slashes", () => {
    expect(buildUsersEndpoint("https://api.example.com/dev/")).toBe("https://api.example.com/dev/admin/users");
  });
  it("returns null when the base URL is missing", () => {
    expect(buildUsersEndpoint(undefined)).toBeNull();
    expect(buildUsersEndpoint("")).toBeNull();
  });
});

describe("messageForStatus", () => {
  it("uses the backend message for 400 responses", () => {
    expect(messageForStatus(400, "Role must be TechnicalStaff or Mentors.")).toBe("Role must be TechnicalStaff or Mentors.");
  });
  it("falls back to a default message for 400 responses without a backend message", () => {
    expect(messageForStatus(400)).toBe("Check the email address and role.");
  });
  it("maps known statuses", () => {
    expect(messageForStatus(401)).toBe("Session expired. Sign in again.");
    expect(messageForStatus(403)).toBe("Admin access required.");
    expect(messageForStatus(409)).toBe("An account already exists for this email.");
    expect(messageForStatus(500)).toBe("Unable to provision the user.");
    expect(messageForStatus(502)).toBe("Unable to provision the user.");
  });
});
