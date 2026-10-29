"use client";

import { type FormEvent, useState } from "react";

import { mockProjects } from "./mock-projects";
import styles from "./ValidationForm.module.css";

type ValidationFormProps = {
  projectId: string;
};

type SubmissionStatus = "idle" | "submitting" | "success" | "error";
type SubmissionAction = "created" | "updated" | null;

const initialValidation = {
  decision: "",
  feedback: "",
  questions: "",
  nextSteps: "",
};

export default function ValidationForm({ projectId }: ValidationFormProps) {
  const project = mockProjects[projectId];
  const submissionMethod = project?.hasValidation ? "PATCH" : "POST";
  const [validation, setValidation] = useState(initialValidation);
  const [status, setStatus] = useState<SubmissionStatus>("idle");
  const [submissionAction, setSubmissionAction] = useState<SubmissionAction>(null);

  function updateField(field: keyof typeof validation, value: string) {
    setValidation((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setSubmissionAction(null);

    try {
      const baseUrl = process.env.NEXT_PUBLIC_PROJECT_API_URL?.replace(/\/$/, "");
      if (!baseUrl) throw new Error("Project API URL is not configured.");

      const response = await fetch(
        `${baseUrl}/validation/projects/${encodeURIComponent(projectId)}`,
        {
          method: submissionMethod,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(validation),
        },
      );

      if (!response.ok) throw new Error("Validation request failed.");

      setValidation(initialValidation);
      setSubmissionAction(submissionMethod === "PATCH" ? "updated" : "created");
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  const isSubmitting = status === "submitting";

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
