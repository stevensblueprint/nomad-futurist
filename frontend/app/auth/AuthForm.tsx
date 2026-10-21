"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./AuthForm.module.css";
import AuthErrorNotice from "./AuthErrorNotice";
import { authErrorMessage } from "./auth-errors";
import { getSignInOutcome, passwordRequirements, validatePassword } from "./authLogic";
import "./amplify-config";
import { autoSignIn, confirmSignUp, fetchAuthSession, signIn, signUp } from "aws-amplify/auth";
type FieldName = "email" | "password" | "confirmPassword" | "confirmationCode";
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

    if (awaitingConfirmation) {
      if (!String(data.get("confirmationCode") ?? "").trim())
        nextErrors.confirmationCode = "Enter your confirmation code.";
    } else if (isSignUp) {
      if (!password) nextErrors.password = "Enter your password.";
      else {
        const issues = validatePassword(password);
        if (issues.length) nextErrors.password = issues.join(" ");
      }
      if (!confirmation)
        nextErrors.confirmPassword = "Confirm your password.";
      else if (confirmation !== password)
        nextErrors.confirmPassword = "Passwords do not match.";
    } else if (!password) {
      nextErrors.password = "Enter your password.";
    }

    return nextErrors;
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (checkingSession || submissionInProgress.current) return;
    const form = event.currentTarget;

    const nextErrors = validate(form);

    setErrors(nextErrors);
    setNotice("");
    setLocalAuthError("");
    setValidationSummary((current) => ({
      message: Object.values(nextErrors).join(" "),
      submission: current.submission + 1,
    }));

    const firstInvalidField = Object.keys(nextErrors)[0] as FieldName | undefined;
    if (firstInvalidField) {
      (form.elements.namedItem(firstInvalidField) as HTMLInputElement | null)?.focus();
      return;
    }

    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    setSubmitting(true);
    submissionInProgress.current = true;
    try {
      if (awaitingConfirmation) {
        const { isSignUpComplete } = await confirmSignUp({
          username: pendingEmail,
          confirmationCode: String(data.get("confirmationCode") ?? "").trim(),
        });
        if (isSignUpComplete) {
          setAwaitingConfirmation(false);
          setPendingEmail("");
          setErrors({});
          try {
            const { isSignedIn } = await autoSignIn();
            router.push(isSignedIn ? "/registration" : "/sign-in");
          } catch {
            router.push("/sign-in");
          }
        } else {
          setLocalAuthError("Account confirmation needs another step. Please try signing in to continue.");
        }
      } else if (isSignUp) {
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
          setErrors({});
          setNotice("Check your email for a confirmation code.");
        } else if (isSignUpComplete) {
          setNotice("Account created. You can now sign in.");
        }
      } else {
        const result = getSignInOutcome(await signIn({ username: email, password }));
        if (result.isSignedIn) {
          router.replace("/");
        } else {
          setLocalAuthError(result.message);
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

  const fields: {
    name: FieldName;
    label: string;
    autoComplete: string;
    type: "email" | "password" | "text";
    inputMode?: "numeric";
    readOnly?: boolean;
  }[] = awaitingConfirmation ? [
    { name: "email", label: "Email address", type: "email", autoComplete: "email", readOnly: true },
    { name: "confirmationCode", label: "Confirmation code", type: "text", inputMode: "numeric", autoComplete: "one-time-code" },
  ] : [
    { name: "email", label: "Email address", type: "email", autoComplete: "email" },
    {
      name: "password",
      label: "Password",
      type: "password",
      autoComplete: isSignUp ? "new-password" : "current-password",
    },
    ...(isSignUp
      ? [{ name: "confirmPassword" as const, label: "Confirm password", type: "password" as const, autoComplete: "new-password" }]
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
          {fields.map(({ name, label, autoComplete, type, inputMode, readOnly }) => (
            <div className={styles.field} key={`${name}-${awaitingConfirmation}`}>
              <label htmlFor={name}>{label}</label>
              {name === "password" && isSignUp && (
                <ul id="password-requirements" className={styles.requirements}>
                  {passwordRequirements.map(({ message }) => <li key={message}>{message}</li>)}
                </ul>
              )}
              <input
                id={name}
                name={name}
                type={type}
                inputMode={inputMode}
                autoComplete={autoComplete}
                readOnly={readOnly}
                defaultValue={name === "email" && awaitingConfirmation ? pendingEmail : undefined}
                required
                disabled={submitting}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={[
                  errors[name] ? `${name}-error` : undefined,
                  name === "password" && isSignUp ? "password-requirements" : undefined,
                ].filter(Boolean).join(" ") || undefined}
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
