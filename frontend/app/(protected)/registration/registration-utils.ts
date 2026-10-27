export type SupportType = "funding" | "human_capital" | "both";

export type RegistrationValues = {
  projectName: string;
  description: string;
  linkedInUrl: string;
  supportType: SupportType;
  needs: string;
  minimum: string;
  maximum: string;
};

export type RegistrationField = keyof RegistrationValues;
export type RegistrationErrors = Partial<Record<RegistrationField, string>>;

export function validateRegistration(values: RegistrationValues): RegistrationErrors {
  const errors: RegistrationErrors = {};
  if (!["funding", "human_capital", "both"].includes(values.supportType)) {
    errors.supportType = "Choose a support type.";
  }
  if (!values.projectName.trim()) errors.projectName = "Enter a project name.";
  if (!values.description.trim()) errors.description = "Enter a project description.";
  if (!values.needs.trim()) errors.needs = "Describe the assistance you need.";

  if (values.linkedInUrl.trim()) {
    try {
      if (!/^https?:\/\//i.test(values.linkedInUrl.trim())) throw new Error();
      const url = new URL(values.linkedInUrl.trim());
      if (!url.hostname || (url.protocol !== "http:" && url.protocol !== "https:")) throw new Error();
    } catch {
      errors.linkedInUrl = "Enter an absolute HTTP or HTTPS URL.";
    }
  }

  if (values.supportType !== "human_capital") {
    const minimum = Number(values.minimum);
    const maximum = Number(values.maximum);
    if (!values.minimum.trim()) errors.minimum = "Enter the minimum funding amount in USD.";
    else if (!Number.isFinite(minimum) || minimum < 0) errors.minimum = "Enter a nonnegative amount.";
    if (!values.maximum.trim()) errors.maximum = "Enter the maximum funding amount in USD.";
    else if (!Number.isFinite(maximum) || maximum < 0) errors.maximum = "Enter a nonnegative amount.";
    if (!errors.minimum && !errors.maximum && minimum > maximum) {
      errors.maximum = "Maximum must be at least the minimum.";
    }
  }
  return errors;
}

export function registrationPayload(values: RegistrationValues) {
  return {
    projectName: values.projectName.trim(),
    description: values.description.trim(),
    linkedInUrl: values.linkedInUrl.trim() || null,
    supportType: values.supportType,
    needs: values.needs.trim(),
    fundingRange:
      values.supportType === "human_capital"
        ? null
        : { minimum: Number(values.minimum), maximum: Number(values.maximum) },
    visionDocument: null,
  };
}

export function projectsEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/projects`;
}

export function isSuccessfulRegistrationResponse(
  value: unknown,
  expected: ReturnType<typeof registrationPayload>,
): boolean {
  if (!isRecord(value)) return false;
  const id = value.projectId;
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return false;
  }
  if (value.status !== "draft") return false;
  return (
    value.projectName === expected.projectName &&
    value.description === expected.description &&
    value.linkedInUrl === expected.linkedInUrl &&
    value.supportType === expected.supportType &&
    value.needs === expected.needs &&
    value.visionDocument === null &&
    (expected.fundingRange === null
      ? value.fundingRange === null
      : isRecord(value.fundingRange) &&
        value.fundingRange.minimum === expected.fundingRange.minimum &&
        value.fundingRange.maximum === expected.fundingRange.maximum)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
