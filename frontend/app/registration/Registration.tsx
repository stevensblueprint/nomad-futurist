"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { fetchAuthSession } from "aws-amplify/auth";
import "../auth/amplify-config";
import styles from "./Registration.module.css";
import {
  projectsEndpoint,
  registrationPayload,
  validateRegistration,
  isSuccessfulRegistrationResponse,
  type RegistrationErrors,
  type RegistrationField,
  type RegistrationValues,
} from "./registration-utils";

const emptyValues: RegistrationValues = {
  projectName: "",
  description: "",
  linkedInUrl: "",
  supportType: "human_capital",
  needs: "",
  minimum: "",
  maximum: "",
};

type Gate = "checking" | "founder" | "denied";

export default function Registration() {
  const router = useRouter();
  const [gate, setGate] = useState<Gate>("checking");
  const [values, setValues] = useState(emptyValues);
  const [errors, setErrors] = useState<RegistrationErrors>({});
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [lastSuccessfulValues, setLastSuccessfulValues] = useState("");
  const submittingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void fetchAuthSession()
      .then((session) => {
        if (!active) return;
        if (!session.tokens?.idToken) {
          router.replace("/sign-in");
          return;
        }
        const groups = session.tokens.idToken.payload["cognito:groups"];
        setGate(Array.isArray(groups) && groups.includes("Founders") ? "founder" : "denied");
      })
      .catch(() => {
        if (active) router.replace("/sign-in");
      });
    return () => { active = false; };
  }, [router]);

  function change<K extends RegistrationField>(field: K, value: RegistrationValues[K]) {
    setValues((current) => ({
      ...current,
      [field]: value,
      ...(field === "supportType" && value === "human_capital" ? { minimum: "", maximum: "" } : {}),
    }));
    setStatus("");
    setErrors((current) => {
      const next = { ...current };
      delete next[field];
      if (field === "supportType" && value === "human_capital") {
        delete next.minimum;
        delete next.maximum;
      }
      return next;
    });
  }

  function validateField(field: RegistrationField) {
    const validation = validateRegistration(values);
    setErrors((current) => ({ ...current, [field]: validation[field] }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current || pending) return;
    const nextErrors = validateRegistration(values);
    setErrors(nextErrors);
    const firstError = Object.keys(nextErrors)[0] as RegistrationField | undefined;
    if (firstError) {
      document.getElementById(firstError)?.focus();
      setStatus("Review the highlighted fields and try again.");
      return;
    }

    const baseUrl = process.env.NEXT_PUBLIC_PROJECT_API_URL?.trim();
    if (!baseUrl) {
      setStatus("Project registration is not configured yet. Please try again later.");
      return;
    }

    submittingRef.current = true;
    setPending(true);
    setSuccess(false);
    setStatus("Submitting your project details…");
    try {
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();
      if (!token) {
        router.replace("/sign-in");
        return;
      }

      const expected = registrationPayload(values);
      const response = await fetch(projectsEndpoint(baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify(expected),
      });
      const contentType = response.headers.get("content-type") ?? "";
      const body: unknown = contentType.includes("application/json")
        ? await response.json().catch(() => null)
        : null;
      if (response.status === 201) {
        if (isSuccessfulRegistrationResponse(body, expected)) {
          setErrors({});
          setSuccess(true);
          setLastSuccessfulValues(JSON.stringify(values));
          setStatus("Your request was processed. The project has not been saved yet.");
        } else {
          setStatus("The server returned an invalid registration response. Please try again.");
        }
      } else if (response.status === 401) {
        setStatus("Your sign-in has expired. Please sign in again.");
      } else if (response.status === 403) {
        setGate("denied");
        setStatus("Your account does not have Founder access.");
      } else if (response.status === 400 && isRecord(body) && isRecord(body.errors)) {
        const serverErrors: RegistrationErrors = {};
        for (const field of Object.keys(emptyValues) as RegistrationField[]) {
          const message = safeMessage(body.errors[field]);
          if (message) serverErrors[field] = message;
        }
        for (const bound of ["minimum", "maximum"] as const) {
          const message = safeMessage(body.errors[`fundingRange.${bound}`]);
          if (message) serverErrors[bound] = message;
        }
        const fundingRangeMessage = safeMessage(body.errors.fundingRange);
        if (fundingRangeMessage) {
          serverErrors.minimum = fundingRangeMessage;
          serverErrors.maximum = fundingRangeMessage;
        }
        setErrors(serverErrors);
        setStatus(safeMessage(body.message) ?? "Check the form fields and try again.");
        const firstField = Object.keys(serverErrors)[0] as RegistrationField | undefined;
        if (firstField) requestAnimationFrame(() => document.getElementById(firstField)?.focus());
      } else if (!response.ok) {
        setStatus(isRecord(body) ? safeMessage(body.message) ?? "We could not process your request. Please try again." : "We could not process your request. Please try again.");
      } else {
        setStatus("The server returned an unexpected response. Please try again.");
      }
    } catch {
      setStatus("We could not reach the registration service. Check your connection and try again.");
    } finally {
      submittingRef.current = false;
      setPending(false);
    }
  }

  if (gate === "checking") {
    return <main className={styles.page} aria-live="polite">Checking your sign-in…</main>;
  }
  if (gate === "denied") {
    return (
      <main className={styles.page}>
        <section className={styles.content} aria-labelledby="register-heading">
          <h1 id="register-heading">Founder access required</h1>
          <p>Your account does not have access to project registration.</p>
          <p><Link href="/">Return home</Link></p>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.content} aria-labelledby="register-heading">
        <header className={styles.header}>
          <h1 id="register-heading">Register your project</h1>
          <p>Share what you are building and the support you need.</p>
        </header>

        <form className={styles.form} noValidate onSubmit={submit}>
          <fieldset className={styles.formFields} disabled={pending}>
          <div className={styles.field}>
            <label htmlFor="projectName">Project name</label>
            <input id="projectName" required value={values.projectName} onChange={(e) => change("projectName", e.target.value)} onBlur={() => validateField("projectName")} aria-invalid={Boolean(errors.projectName)} aria-describedby={errors.projectName ? "projectName-error" : undefined} />
            {errors.projectName && <p id="projectName-error" className={styles.error}>{errors.projectName}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="description">Project description</label>
            <textarea id="description" required rows={4} value={values.description} onChange={(e) => change("description", e.target.value)} onBlur={() => validateField("description")} aria-invalid={Boolean(errors.description)} aria-describedby={errors.description ? "description-error" : undefined} />
            {errors.description && <p id="description-error" className={styles.error}>{errors.description}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="linkedInUrl">Project or company URL <span>(optional)</span></label>
            <input id="linkedInUrl" type="url" inputMode="url" value={values.linkedInUrl} onChange={(e) => change("linkedInUrl", e.target.value)} onBlur={() => validateField("linkedInUrl")} aria-invalid={Boolean(errors.linkedInUrl)} aria-describedby={errors.linkedInUrl ? "linkedInUrl-error" : undefined} />
            {errors.linkedInUrl && <p id="linkedInUrl-error" className={styles.error}>{errors.linkedInUrl}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="supportType">Support type</label>
            <select id="supportType" required value={values.supportType} onChange={(e) => change("supportType", e.target.value as RegistrationValues["supportType"])} onBlur={() => validateField("supportType")} aria-invalid={Boolean(errors.supportType)} aria-describedby={errors.supportType ? "supportType-error" : undefined}>
              <option value="human_capital">Human capital</option>
              <option value="funding">Funding</option>
              <option value="both">Funding and human capital</option>
            </select>
            {errors.supportType && <p id="supportType-error" className={styles.error}>{errors.supportType}</p>}
          </div>

          <div className={styles.field}>
            <label htmlFor="needs">What assistance do you need?</label>
            <textarea id="needs" required rows={3} value={values.needs} onChange={(e) => change("needs", e.target.value)} onBlur={() => validateField("needs")} aria-invalid={Boolean(errors.needs)} aria-describedby={errors.needs ? "needs-error" : undefined} />
            {errors.needs && <p id="needs-error" className={styles.error}>{errors.needs}</p>}
          </div>

          {values.supportType !== "human_capital" && (
            <fieldset className={styles.funding}>
              <legend>Requested funding (USD)</legend>
              <div className={styles.fundingFields}>
                {(["minimum", "maximum"] as const).map((field) => (
                  <div className={styles.field} key={field}>
                    <label htmlFor={field}>{field === "minimum" ? "Minimum" : "Maximum"} amount (USD)</label>
                    <input id={field} required type="number" min="0" step="any" inputMode="decimal" value={values[field]} onChange={(e) => change(field, e.target.value)} onBlur={() => validateField(field)} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${field}-error` : undefined} />
                    {errors[field] && <p id={`${field}-error`} className={styles.error}>{errors[field]}</p>}
                  </div>
                ))}
              </div>
            </fieldset>
          )}

          <div className={styles.placeholder}>
            <strong>Vision document</strong>
            <span>Document upload will be available later.</span>
          </div>
          </fieldset>
          <p className={styles.formStatus} role={success ? "status" : "alert"} aria-live="polite" aria-atomic="true">{status}</p>
          <button className={styles.submit} type="submit" disabled={pending || Object.keys(validateRegistration(values)).length > 0 || (success && JSON.stringify(values) === lastSuccessfulValues)}>
            {pending ? "Submitting…" : "Submit registration"}
          </button>
        </form>
        <p className={styles.footer}><Link href="/">Return home</Link></p>
      </section>
    </main>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeMessage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const message = value.trim();
  return message ? message.slice(0, 500) : undefined;
}
