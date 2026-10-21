"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./AuthForm.module.css";
import AuthErrorNotice from "./AuthErrorNotice";
import { authErrorMessage } from "./auth-errors";
import "./amplify-config";
import { autoSignIn, confirmSignUp, fetchAuthSession, signIn, signUp } from "aws-amplify/auth";
type FieldName = "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldName, string>>;

type AuthFormProps = {
  mode: "sign-up" | "sign-in";
  authenticationError?: string;
};

export default function AuthForm({ mode, authenticationError }: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState("");
  const [validationSummary, setValidationSummary] = useState({
    message: "",
    submission: 0,
  });
  const [localAuthError, setLocalAuthError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(!isSignUp);
  const submissionInProgress = useRef(false);
  const displayedError = localAuthError || authenticationError;

  useEffect(() => {
    if (isSignUp) return;
    let active = true;

    void fetchAuthSession()
      .then((session) => {
        if (!active) return;
        if (session.tokens?.accessToken) {
          router.replace("/");
        } else {
          setCheckingSession(false);
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (!(error instanceof Object && "name" in error && error.name === "UserUnAuthenticatedException")) {
          setLocalAuthError(authErrorMessage(error));
        }
        setCheckingSession(false);
      });

    return () => { active = false; };
  }, [isSignUp, router]);

  function validate(form: HTMLFormElement): FieldErrors {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmPassword") ?? "");
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    const nextErrors: FieldErrors = {};

    if (!email) nextErrors.email = "Enter your email address.";
    else if (emailInput.validity.typeMismatch)
      nextErrors.email = "Enter a valid email address.";

    if (!password) nextErrors.password = "Enter your password.";

    if (isSignUp && !awaitingConfirmation) {
      if (!confirmation)
        nextErrors.confirmPassword = "Confirm your password.";
      else if (confirmation !== password)
        nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkingSession || submissionInProgress.current) return;
    const form = event.currentTarget;
    if (awaitingConfirmation) {
      const code = String(new FormData(form).get("password") ?? "").trim();
      setSubmitting(true);
      submissionInProgress.current = true;
      setLocalAuthError("");
      try {
        await confirmSignUp({ username: pendingEmail, confirmationCode: code });
        setAwaitingConfirmation(false);
        try {
          const { isSignedIn } = await autoSignIn();
          router.push(isSignedIn ? "/registration" : "/sign-in");
        } catch {
          router.push("/sign-in");
        }
      } catch (error: unknown) {
        setLocalAuthError(
          error instanceof Error ? error.message : "That confirmation code is incorrect."
        );
      } finally {
        submissionInProgress.current = false;
        setSubmitting(false);
      }
      return;
    }

    const nextErrors = validate(form);

    setErrors(nextErrors);
    setNotice("");
    setLocalAuthError("");
    setValidationSummary((current) => ({
      message: Object.values(nextErrors).join(" "),
      submission: current.submission + 1,
    }));

    const firstInvalidField = Object.keys(nextErrors)[0];
    if (firstInvalidField) {
      (form.elements.namedItem(firstInvalidField) as HTMLInputElement).focus();
      return;
    }

    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setSubmitting(true);
    submissionInProgress.current = true;
    try {
      if (isSignUp) {
        const { isSignUpComplete, nextStep } = await signUp({
          username: email,
          password,
          options: {
            userAttributes: { email },
            autoSignIn: true,
          },
        });
        if (!isSignUpComplete && nextStep.signUpStep === "CONFIRM_SIGN_UP") {
          setPendingEmail(email);
          setAwaitingConfirmation(true);
          setNotice("Check your email for a confirmation code.");
        }
      } else {
        const result = await signIn({ username: email, password });
        if (result.isSignedIn) {
          router.replace("/");
        } else {
          setNotice("Complete the sign-in steps to continue.");
        }
      }
    } catch (err) {
      // Another tab can sign in after the initial session check.
      if (!isSignUp && err instanceof Object && "name" in err && err.name === "UserAlreadyAuthenticatedException") {
        try {
          if ((await fetchAuthSession()).tokens?.accessToken) {
            router.replace("/");
            return;
          }
        } catch (sessionError) {
          setLocalAuthError(authErrorMessage(sessionError));
          return;
        }
      }
      setLocalAuthError(authErrorMessage(err));
    } finally {
      submissionInProgress.current = false;
      setSubmitting(false);
    }
  }

  const fields: { name: FieldName; label: string; autoComplete: string }[] = [
    { name: "email", label: "Email address", autoComplete: "email" },
    {
      name: "password",
      label: awaitingConfirmation ? "Confirmation code" : "Password",
      autoComplete: isSignUp ? "new-password" : "current-password",
    },
    ...(isSignUp && !awaitingConfirmation
      ? [{ name: "confirmPassword" as const, label: "Confirm password", autoComplete: "new-password" }]
      : []),
  ];

  if (checkingSession) {
    return (
      <main className={styles.page}>
        <p role="status">Checking your sign-in session...</p>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.content} aria-labelledby="auth-heading">
        <header className={styles.header}>
          <h1 id="auth-heading">{isSignUp ? "Sign up" : "Sign in"}</h1>
          <p>
            {isSignUp
              ? "Create your founder account."
              : "Welcome back to Nomad Incubator."}
          </p>
        </header>

        <form
          noValidate
          onSubmit={handleSubmit}
          onChange={(event) => {
            setNotice("");
            setLocalAuthError("");
            setValidationSummary((current) => ({ ...current, message: "" }));
            const nextErrors = validate(event.currentTarget);
            setErrors((currentErrors) => {
              const remainingErrors: FieldErrors = {};
              // Recheck existing errors without introducing new ones until submit.
              for (const field of Object.keys(currentErrors) as FieldName[]) {
                if (nextErrors[field]) remainingErrors[field] = nextErrors[field];
              }
              return remainingErrors;
            });
          }}
          className={styles.form}
        >
          <div className="sr-only" aria-live="assertive" aria-atomic="true">
            {validationSummary.message && (
              // Replace the message on each submit, even if the errors are unchanged.
              <p key={validationSummary.submission}>{validationSummary.message}</p>
            )}
          </div>
          {fields.map(({ name, label, autoComplete }) => (
            <div className={styles.field} key={name}>
              <label htmlFor={name}>{label}</label>
              <input
                id={name}
                name={name}
                type={name === "email" ? "email" : "password"}
                autoComplete={autoComplete}
                required
                disabled={submitting}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={errors[name] ? `${name}-error` : undefined}
              />
              {errors[name] && (
                <p id={`${name}-error`} className={styles.error}>
                  {errors[name]}
                </p>
              )}
            </div>
          ))}

          <AuthErrorNotice message={displayedError} />
          <div aria-live="polite" aria-atomic="true">
            {notice && <p className={styles.notice}>{notice}</p>}
          </div>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting
            ? "Please wait..."
            : awaitingConfirmation ?
            "Confirm"
            : isSignUp ? 
            "Create account" : 
            "Sign in"}
          </button>
        </form>

        <p className={styles.footer}>
          {isSignUp ? "Already have an account? " : "Need an account? "}
          <Link href={isSignUp ? "/sign-in" : "/sign-up"}>
            {isSignUp ? "Sign in" : "Sign up"}
          </Link>
        </p>
      </section>
    </main>
  );
}
