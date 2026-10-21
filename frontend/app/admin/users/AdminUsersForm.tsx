"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { fetchAuthSession, getCurrentUser } from "aws-amplify/auth";
import "../../lib/amplify";
import styles from "./AdminUsersForm.module.css";
import {
  isAdmin,
  isProvisionRole,
  messageForStatus,
  PROVISION_ROLES,
  type ProvisionRole,
} from "./adminUsers";

const ENDPOINT = "/api/admin/users";

type View = "loading" | "signed-out" | "forbidden" | "ready";
type FieldErrors = { email?: string; role?: string };

function roleLabel(role: ProvisionRole): string {
  return role === "TechnicalStaff" ? "Technical Staff" : "Mentor";
}

export default function AdminUsersForm() {
  const [view, setView] = useState<View>("loading");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [authError, setAuthError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        await getCurrentUser();
      } catch {
        if (!cancelled) setView("signed-out");
        return;
      }

      try {
        const session = await fetchAuthSession();
        const groups = session.tokens?.idToken?.payload["cognito:groups"];
        if (!isAdmin(groups)) {
          if (!cancelled) setView("forbidden");
          return;
        }
        if (!cancelled) setView("ready");
      } catch {
        if (!cancelled) setView("signed-out");
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const role = String(data.get("role") ?? "");

    const nextErrors: FieldErrors = {};
    if (!email) nextErrors.email = "Enter the recipient email address.";
    if (!isProvisionRole(role)) nextErrors.role = "Choose Technical Staff or Mentor.";

    setErrors(nextErrors);
    setNotice("");
    setAuthError("");

    const firstInvalidField = Object.keys(nextErrors)[0];
    if (firstInvalidField) {
      const field = form.elements.namedItem(firstInvalidField);
      if (field instanceof HTMLElement) field.focus();
      return;
    }

    setSubmitting(true);
    try {
      let token: string | undefined;
      try {
        const session = await fetchAuthSession();
        token = session.tokens?.idToken?.toString();
      } catch {
        setAuthError("Session expired. Sign in again.");
        return;
      }

      if (!token) {
        setAuthError("Session expired. Sign in again.");
        return;
      }

      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, role: role as ProvisionRole }),
      });

      let payload: { message?: unknown } = {};
      try {
        payload = await response.json();
      } catch {
        payload = {};
      }

      const backendMessage =
        typeof payload?.message === "string" ? payload.message : undefined;

      if (response.status === 201) {
        form.reset();
        setNotice("Invitation sent.");
      } else {
        setAuthError(messageForStatus(response.status, backendMessage));
      }
    } catch {
      setAuthError("Unable to reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (view === "loading") {
    return (
      <main className={styles.page}>
        <p role="status">Loading...</p>
      </main>
    );
  }

  if (view === "signed-out") {
    return (
      <main className={styles.page}>
        <section className={styles.content}>
          <header className={styles.header}>
            <h1>Sign in required.</h1>
            <p>
              <Link href="/sign-in">Go to sign in</Link>
            </p>
          </header>
        </section>
      </main>
    );
  }

  if (view === "forbidden") {
    return (
      <main className={styles.page}>
        <section className={styles.content}>
          <header className={styles.header}>
            <h1>Admin access required.</h1>
            <p>Only Admin users can provision accounts.</p>
          </header>
        </section>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.content} aria-labelledby="admin-users-heading">
        <header className={styles.header}>
          <h1 id="admin-users-heading">Create an account</h1>
          <p>Invite a Technical Staff member or Mentor.</p>
        </header>

        <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <div className={styles.field}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {errors.email && (
              <p id="email-error" className={styles.error}>
                {errors.email}
              </p>
            )}
          </div>

          <div className={styles.field}>
            <label htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              defaultValue=""
              required
              aria-invalid={Boolean(errors.role)}
              aria-describedby={errors.role ? "role-error" : undefined}
            >
              <option value="" disabled>
                Select a role
              </option>
              {PROVISION_ROLES.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(role)}
                </option>
              ))}
            </select>
            {errors.role && (
              <p id="role-error" className={styles.error}>
                {errors.role}
              </p>
            )}
          </div>

          <div aria-live="polite" aria-atomic="true">
            {authError && (
              <p role="alert" className={styles.error}>
                {authError}
              </p>
            )}
            {notice && <p className={styles.notice}>{notice}</p>}
          </div>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting ? "Sending..." : "Send invitation"}
          </button>
        </form>
      </section>
    </main>
  );
}
