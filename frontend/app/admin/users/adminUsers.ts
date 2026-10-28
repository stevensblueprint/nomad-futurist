export type ProvisionRole = "TechnicalStaff" | "Mentors";
export const PROVISION_ROLES: ProvisionRole[] = ["TechnicalStaff", "Mentors"];

export function parseGroups(claim: unknown): string[] {
  if (Array.isArray(claim)) return claim.filter((group): group is string => typeof group === "string");
  if (typeof claim !== "string") return [];
  const value = claim.trim();
  if (!value) return [];
  if (value.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((group): group is string => typeof group === "string") : [];
    } catch { return []; }
  }
  return value.split(",").map((group) => group.trim()).filter(Boolean);
}

export function isAdmin(claim: unknown): boolean {
  return parseGroups(claim).includes("Admin");
}

export function isProvisionRole(value: string): value is ProvisionRole {
  return (PROVISION_ROLES as string[]).includes(value);
}

export function buildUsersEndpoint(baseUrl: string | undefined): string | null {
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/+$/, "")}/admin/users`;
}

export function messageForStatus(status: number, backendMessage?: string): string {
  switch (status) {
    case 400: return backendMessage || "Check the email address and role.";
    case 401: return "Session expired. Sign in again.";
    case 403: return "Admin access required.";
    case 409: return "An account already exists for this email.";
    default: return "Unable to provision the user.";
  }
}
