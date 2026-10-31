export type MockProject = {
  name: string;
  hasValidation: boolean;
};

export const mockProjects: Record<string, MockProject> = {
  "project-123": { name: "Example Project", hasValidation: false },
  "project-456": { name: "Sample Project", hasValidation: true },
};
