"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchAuthSession } from "aws-amplify/auth";
import { type FormEvent, useEffect, useState } from "react";

import "../../../auth/amplify-config";
import { mockProjects } from "./mock-projects";
import styles from "./ValidationForm.module.css";

type ValidationFormProps = {
  projectId: string;
};

type SubmissionStatus = "idle" | "submitting" | "success" | "error";
type SubmissionAction = "created" | "updated" | null;
type Access = "checking" | "allowed" | "denied";


const ALLOWED_GROUPS = new Set([
  "Admin",
  "TechnicalStaff",
  "Mentors"
])

const initialValidation = {
  decision: "",
  feedback: "",
  questions: "",
  nextSteps: "",
};

function hasValidationAccess(groups: unknown): boolean {
  return Array.isArray(groups) &&
    groups.some((group) => typeof (group) === "string" && ALLOWED_GROUPS.has(group));
}

export default function ValidationForm({ projectId }: ValidationFormProps) {
  const router = useRouter();
  const project = mockProjects[projectId];
  const submissionMethod = project?.hasValidation ? "PATCH" : "POST";
  const [validation, setValidation] = useState(initialValidation);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [submissionAction, setSubmissionAction] = useState<SubmissionAction>(null);
  const [access, setAccess] = useState<Access>("checking");

  useEffect(() => {
    let active = true;
    void fetchAuthSession()
      .then((session) => {
        if (!active) return;
        const token = session.tokens?.idToken;
        if (!token) {
          router.replace("/sign-in");
          return;
        }
        setAccess(hasValidationAccess(token.payload["cognito:groups"]) ? "allowed" : "denied");
      })
      .catch(() => {
        if (active) router.replace("/sign-in");
      });
    return () => { active = false; };
  }, [router]);

  function updateField(field: keyof typeof validation, value: string) {
    setValidation((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (access !== "allowed") return;
    setStatus("submitting");
    setSubmissionAction(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_PROJECT_API_URL?.replace(/\/$/, "");
      if (!baseUrl) throw new Error("Project API URL is not configured.");

      const session = await fetchAuthSession();
      const idToken = session.tokens?.idToken;
      if (!idToken) {
        router.replace("/sign-in");
        return;
      }
      if (!hasValidationAccess(idToken.payload["cognito:groups"])) {
        setAccess("denied");
        return;
      }

      const response = await fetch(
        `${baseUrl}/validation/projects/${encodeURIComponent(projectId)}`,
        {
          method: submissionMethod,
          headers: { "Content-Type": "application/json", Authorization: idToken.toString() },
          body: JSON.stringify(validation),
        },
      );

      if (response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (response.status === 403) {
        setAccess("denied");
        return;
      }
      if (!response.ok) throw new Error("Validation request failed.");

      setValidation(initialValidation);
      setSubmissionAction(submissionMethod === "PATCH" ? "updated" : "created");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const isSubmitting = status === "submitting";

  if (access === "checking") {
    return <main className={styles.page} aria-live="polite">Checking your sign-in…</main>;
  }
  if (access === "denied") {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <h1>Validation access required</h1>
          <p>Your account does not have access to project validation.</p>
          <p><Link href="/">Return home</Link></p>
        </div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className={styles.page}>
        <div className={styles.content}>
          <header className={styles.header}>
            <h1>Project not found</h1>
            <p>No mock project is available for project {projectId}.</p>
          </header>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <header className={styles.header}>
          <h1>Project Validation</h1>
          <p>Submit a validation decision for {project.name}.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label htmlFor="decision">Validation decision</label>
            <select
              id="decision"
              name="decision"
              value={validation.decision}
              onChange={(event) => updateField("decision", event.target.value)}
              required
            >
              <option value="">Select a decision</option>
              <option value="approved">Approved</option>
              <option value="needs-changes">Needs changes</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="feedback">Reviewer feedback</label>
            <textarea
              id="feedback"
              name="feedback"
              value={validation.feedback}
              onChange={(event) => updateField("feedback", event.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="questions">Questions</label>
            <textarea
              id="questions"
              name="questions"
              value={validation.questions}
              onChange={(event) => updateField("questions", event.target.value)}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="nextSteps">Next steps</label>
            <textarea
              id="nextSteps"
              name="nextSteps"
              value={validation.nextSteps}
              onChange={(event) => updateField("nextSteps", event.target.value)}
              required
            />
          </div>

          <div aria-live="polite" aria-atomic="true">
            {status === "success" && (
              <p className={styles.notice}>
                Validation {submissionAction} successfully.
              </p>
            )}
            {status === "error" && (
              <p role="alert" className={styles.error}>
                Unable to submit validation. Please try again.
              </p>
            )}
          </div>

          <button className={styles.submit} type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Submitting validation…" : "Submit validation"}
          </button>
        </form>
      </div>
    </main>
  );
}
