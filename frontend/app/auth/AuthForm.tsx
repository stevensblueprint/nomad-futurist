"use client";


import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./AuthForm.module.css";
import { useRouter } from "next/navigation";
import "../lib/amplify";
import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  signIn,
  signUp,
} from "aws-amplify/auth";

type FieldName = "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldName, string>>;
type Challenge = "new-password" | "email-code" | null;

type Field = {
  name: FieldName;
  label: string;
  type: "email" | "password" | "text";
  autoComplete: string;
};

type AuthFormProps = {
  mode: "sign-up" | "sign-in";
  authenticationError?: string;
};

function isEmailCodeStep(step: string): boolean {
  return (
    step === "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" ||
    step === "CONFIRM_SIGN_IN_WITH_OTP"
  );
}

function errorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "UsernameExistsException")
    return "An account with that email already exists.";
  if (name === "NotAuthorizedException") return "Incorrect email or password.";
  if (name === "CodeMismatchException") return "That code is incorrect.";
  if (name === "ExpiredCodeException") return "That code has expired.";
  if (name === "InvalidPasswordException")
    return "That password does not meet the requirements.";
  return "Something went wrong. Please try again.";
}

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
  const [challenge, setChallenge] = useState<Challenge>(null);
  const displayedError = localAuthError || authenticationError;

  function validate(form: HTMLFormElement): FieldErrors {
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmPassword") ?? "");
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    const nextErrors: FieldErrors = {};

    const requiresEmail = !awaitingConfirmation && challenge === null;
    if (requiresEmail) {
      if (!email) nextErrors.email = "Enter your email address.";
      else if (emailInput.validity.typeMismatch)
        nextErrors.email = "Enter a valid email address.";
    }

    if (!password) {
      nextErrors.password =
        challenge === "email-code" || awaitingConfirmation
          ? "Enter your code."
          : challenge === "new-password"
            ? "Enter your new password."
            : "Enter your password.";
    }

    const requiresConfirmation =
      (isSignUp && !awaitingConfirmation) || challenge === "new-password";
    if (requiresConfirmation) {
      if (!confirmation) nextErrors.confirmPassword = "Confirm your password.";
      else if (confirmation !== password)
        nextErrors.confirmPassword = "Passwords do not match.";
    }

    return nextErrors;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    let confirmationSucceeded = false;

    if (awaitingConfirmation) {
      const code = String(new FormData(form).get("password") ?? "").trim();
      setSubmitting(true);
      setLocalAuthError("");
      try {
        await confirmSignUp({ username: pendingEmail, confirmationCode: code });
        confirmationSucceeded = true;
      } catch (err) {
        setLocalAuthError(
          (err as { message?: string })?.message ||
            "That confirmation code is incorrect.",
        );
        setSubmitting(false);
        return;
      }

      if (confirmationSucceeded) {
        try {
          const { isSignedIn } = await autoSignIn();
          if (isSignedIn) {
            router.push('/registration');
          } else {
            router.push('/sign-in');
          }
        } catch {
          setLocalAuthError("Account verified! Redirecting to sign in...");
          setTimeout(() => {
            router.push('/signin');
          }, 2000);
        } finally {
          setSubmitting(false);
        }
      }
      return;
    }

    const nextErrors = validate(form);

    setErrors(nextErrors);
    setNotice("");
    setValidationSummary((current) => ({
      message: Object.values(nextErrors).join(" "),
      submission: current.submission + 1,
    }));

    const firstInvalidField = Object.keys(nextErrors)[0];
    if (firstInvalidField) {
      (form.elements.namedItem(firstInvalidField) as HTMLInputElement | null)?.focus();
      return;
    }

    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");

    setSubmitting(true);
    setLocalAuthError("");
    try {
      if (challenge) {
        const { isSignedIn, nextStep } = await confirmSignIn({
          challengeResponse: password,
        });
        if (isSignedIn) {
          setChallenge(null);
          setNotice("Signed in.");
        } else if (isEmailCodeStep(nextStep.signInStep)) {
          setChallenge("email-code");
          setNotice("Enter the code from your email.");
        } else {
          setLocalAuthError("Additional sign-in verification is required.");
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
          setNotice("Check your email for a confirmation code.");
        }
      } else {
        const { isSignedIn, nextStep } = await signIn({
          username: email,
          password,
        });
        if (isSignedIn) {
          setNotice("Signed in.");
        } else if (
          nextStep.signInStep === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED"
        ) {
          setChallenge("new-password");
          setNotice("Create a new password.");
        } else if (isEmailCodeStep(nextStep.signInStep)) {
          setChallenge("email-code");
          setNotice("Enter the code from your email.");
        } else {
          setLocalAuthError("Additional sign-in verification is required.");
        }
      }
    } catch (err) {
      setLocalAuthError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldContext = awaitingConfirmation ? "confirm" : challenge ?? "default";

  let fields: Field[];
  if (awaitingConfirmation || challenge === "email-code") {
    fields = [
      {
        name: "password",
        label: "Email code",
        type: "text",
        autoComplete: "one-time-code",
      },
    ];
  } else if (challenge === "new-password") {
    fields = [
      {
        name: "password",
        label: "New password",
        type: "password",
        autoComplete: "new-password",
      },
      {
        name: "confirmPassword",
        label: "Confirm new password",
        type: "password",
        autoComplete: "new-password",
      },
    ];
  } else {
    fields = [
      {
        name: "email",
        label: "Email address",
        type: "email",
        autoComplete: "email",
      },
      {
        name: "password",
        label: "Password",
        type: "password",
        autoComplete: isSignUp ? "new-password" : "current-password",
      },
    ];
    if (isSignUp) {
      fields.push({
        name: "confirmPassword",
        label: "Confirm password",
        type: "password",
        autoComplete: "new-password",
      });
    }
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
          {fields.map(({ name, label, type, autoComplete }) => (
            <div className={styles.field} key={`${fieldContext}-${name}`}>
              <label htmlFor={name}>{label}</label>
              <input
                id={name}
                name={name}
                type={type}
                autoComplete={autoComplete}
                required
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

          <div aria-live="polite" aria-atomic="true">
            {displayedError && (
              <p role="alert" className={styles.error}>{displayedError}</p>
            )}
            {notice && <p className={styles.notice}>{notice}</p>}
          </div>

          <button type="submit" className={styles.submit} disabled={submitting}>
            {submitting
              ? "Please wait..."
              : awaitingConfirmation || challenge === "email-code"
                ? "Confirm"
                : challenge === "new-password"
                  ? "Set password"
                  : isSignUp
                    ? "Create account"
                    : "Sign in"}
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
