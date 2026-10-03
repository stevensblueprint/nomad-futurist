"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import styles from "./AuthForm.module.css";
;
import { Amplify } from 'aws-amplify';
import { signUp, confirmSignUp, signIn } from "aws-amplify/auth";

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID!,
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_APP_CLIENT_ID!,

      loginWith: {
        email: true
      },
      signUpVerificationMethod: 'code',
      userAttributes: {
        email: { required: true }
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true
      }
    }
  }
});
type FieldName = "email" | "password" | "confirmPassword";
type FieldErrors = Partial<Record<FieldName, string>>;

type AuthFormProps = {
  mode: "sign-up" | "sign-in";
  authenticationError?: string;
};

export default function AuthForm({ mode, authenticationError }: AuthFormProps) {
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
  const displayedError = localAuthError || authenticationError;

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
    const form = event.currentTarget;
    if (awaitingConfirmation) {
      const code = String(new FormData(form).get("password") ?? "").trim();
      setSubmitting(true);
      setLocalAuthError("");
      try {
        await confirmSignUp({ username: pendingEmail, confirmationCode: code });
        setAwaitingConfirmation(false);
        setNotice("Confirmed. You can now sign in.");
      } catch {
        setLocalAuthError("That confirmation code is incorrect.");
      } finally {
        setSubmitting(false);
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
      (form.elements.namedItem(firstInvalidField) as HTMLInputElement).focus();
      return;
    }

    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    
   
    setSubmitting(true);
    try {
      if (isSignUp) {
        const { isSignUpComplete, nextStep } = await signUp({
          username: email,
          password,
          options: { userAttributes: { email } },
        });
        if (!isSignUpComplete && nextStep.signUpStep === "CONFIRM_SIGN_UP") {
          setPendingEmail(email);
          setAwaitingConfirmation(true);
          setNotice("Check your email for a confirmation code.");
        }
      } else {
        await signIn({ username: email, password });
        setNotice("Signed in.");
      }
    } catch (err) {
      setLocalAuthError(
        (err as { name?: string })?.name === "UsernameExistsException"
          ? "An account with that email already exists."
          : (err as { name?: string })?.name === "NotAuthorizedException"
          ? "Incorrect email or password."
          : "Something went wrong. Please try again."
      );
    } finally {
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
            setLocalAuthError("")
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
