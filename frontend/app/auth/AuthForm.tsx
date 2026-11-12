"use client";

import Link from "next/link";
import AuthLayout from "./AuthLayout";
import FormField from "../components/auth/FormField";
import PrimaryButton from "../components/auth/PrimaryButton";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import styles from "./AuthForm.module.css";
import AuthErrorNotice from "./AuthErrorNotice";
import { authErrorMessage } from "./auth-errors";
import { getSignInOutcome, validatePassword } from "./authLogic";
import "./amplify-config";
import {
  autoSignIn,
  confirmSignIn,
  confirmSignUp,
  fetchAuthSession,
  signIn,
  signUp,
} from "aws-amplify/auth";
type FieldName = "email" | "password" | "confirmPassword" | "confirmationCode";
type FieldErrors = Partial<Record<FieldName, string>>;
// Extra Cognito sign-in steps, such as an admin's first sign-in with a temporary password.
type Challenge = "new-password" | "email-code" | null;

function isEmailCodeStep(step: string): boolean {
  return (
    step === "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" ||
    step === "CONFIRM_SIGN_IN_WITH_OTP"
  );
}

type AuthFormProps = {
  mode: "sign-up" | "sign-in";
  authenticationError?: string;
  initialNotice?: string;
};

export default function AuthForm({ mode, authenticationError, initialNotice }: AuthFormProps) {
  const router = useRouter();
  const isSignUp = mode === "sign-up";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState(initialNotice ?? "");
  const [validationSummary, setValidationSummary] = useState({
    message: "",
    submission: 0,
  });
  const [localAuthError, setLocalAuthError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(!isSignUp);
  const [challenge, setChallenge] = useState<Challenge>(null);
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
    const emailInput = form.elements.namedItem("email") as HTMLInputElement | null;
    const nextErrors: FieldErrors = {};

    // The email field is absent after sign-up or while a sign-in challenge is open.
    if (!awaitingConfirmation && challenge === null) {
      if (!email) nextErrors.email = "Enter your email address.";
      else if (emailInput?.validity.typeMismatch)
        nextErrors.email = "Enter a valid email address.";
    }

    if (awaitingConfirmation || challenge === "email-code") {
      if (!String(data.get("confirmationCode") ?? "").trim())
        nextErrors.confirmationCode = awaitingConfirmation
          ? "Enter your confirmation code."
          : "Enter your email code.";
    } else if (isSignUp || challenge === "new-password") {
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

  function handleSignInResult(result: {
    isSignedIn: boolean;
    nextStep: { signInStep: string };
  }) {
    if (result.isSignedIn) {
      router.replace("/");
      return;
    }
    const step = result.nextStep.signInStep;
    if (step === "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED") {
      setChallenge("new-password");
      setErrors({});
      setNotice("Create a new password.");
    } else if (isEmailCodeStep(step)) {
      setChallenge("email-code");
      setErrors({});
      setNotice("Enter the code from your email.");
    } else {
      const outcome = getSignInOutcome(result);
      if (!outcome.isSignedIn) setLocalAuthError(outcome.message);
    }
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
      if (challenge) {
        handleSignInResult(
          await confirmSignIn({
            challengeResponse:
              challenge === "email-code"
                ? String(data.get("confirmationCode") ?? "").trim()
                : password,
          }),
        );
      } else if (awaitingConfirmation) {
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
            router.push(isSignedIn ? "/" : "/sign-in");
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
        handleSignInResult(await signIn({ username: email, password }));
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

  const fieldContext = awaitingConfirmation ? "confirm" : (challenge ?? "default");
  const showPasswordRequirements = isSignUp || challenge === "new-password";

  const fields: {
    name: FieldName;
    label: string;
    autoComplete: string;
    type: "email" | "password" | "text";
    inputMode?: "numeric";
  }[] = awaitingConfirmation || challenge === "email-code"
      ? [
        {
          name: "confirmationCode",
          label: awaitingConfirmation ? "Confirmation code" : "Email code",
          type: "text",
          inputMode: "numeric",
          autoComplete: "one-time-code",
        },
      ]
      : challenge === "new-password"
      ? [
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
      ]
      : [
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
        ...(isSignUp
          ? [
            {
              name: "confirmPassword" as const,
              label: "Confirm password",
              type: "password" as const,
              autoComplete: "new-password",
            },
          ]
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
    <AuthLayout>
      <header className={styles.header}>
        <h1 id="auth-heading">
          {awaitingConfirmation || challenge === "email-code"
            ? "Check your email"
            : challenge === "new-password"
              ? "Set a new password"
              : isSignUp
                ? "Create your account"
                : "Welcome back"}
        </h1>
        <p>
          {awaitingConfirmation
            ? `We sent a code to ${pendingEmail}. Enter it below to confirm your account.`
            : challenge === "email-code"
              ? "We sent a sign-in code to your email. Enter it below to finish signing in."
              : challenge === "new-password"
                ? "Choose a new password to finish signing in."
                : isSignUp
                  ? "Start your journey as a founder."
                  : "Sign in to your Nomad Incubator account."}
        </p>
      </header>

      {awaitingConfirmation && (
        <div className={styles.confirmNotice}>
          <strong>One more step to get started</strong>
          <p>Check your inbox and spam folder.</p>
        </div>
      )}
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
            <p key={validationSummary.submission}>
              {validationSummary.message}
            </p>
          )}
        </div>
        {fields.map(
          ({ name, label, autoComplete, type, inputMode }) => (
            <FormField
              key={`${name}-${fieldContext}`}
              id={name}
              label={label}
              error={errors[name]}
            >
              <input
                id={name}
                name={name}
                type={type}
                inputMode={inputMode}
                autoComplete={autoComplete}
                placeholder={
                  name === "email"
                    ? "you@example.com"
                    : name === "confirmationCode"
                      ? "Enter your code"
                      : name === "confirmPassword"
                        ? "Re-enter your password"
                        : "Enter your password"
                }
                autoFocus={name === "confirmationCode"}
                required
                disabled={submitting}
                aria-invalid={Boolean(errors[name])}
                aria-describedby={
                  [
                    errors[name] ? `${name}-error` : undefined,
                    name === "password" && showPasswordRequirements
                      ? "password-requirements"
                      : undefined,
                    name === "confirmationCode" ? "code-help" : undefined,
                  ]
                    .filter(Boolean)
                    .join(" ") || undefined
                }
              />
              {name === "password" && showPasswordRequirements && (
                <p id="password-requirements" className={styles.requirements}>
                  At least 8 characters, including uppercase and lowercase
                  letters, a number, and a special character.
                </p>
              )}
              {name === "confirmationCode" && (
                <p id="code-help" className={styles.requirements}>
                  {awaitingConfirmation
                    ? "Use the code from your confirmation email."
                    : "Use the code from your sign-in email."}
                </p>
              )}
            </FormField>
          ),
        )}

        <AuthErrorNotice message={displayedError} />
        <div
          aria-live="polite"
          aria-atomic="true"
          className={
            awaitingConfirmation
              ? "sr-only"
              : !notice
                ? styles.emptyFeedback
                : undefined
          }
        >
          {notice && <p className={styles.notice}>{notice}</p>}
        </div>

        <PrimaryButton
          type="submit"
          loading={submitting}
          loadingLabel={
            awaitingConfirmation || challenge === "email-code"
              ? "Confirming…"
              : challenge === "new-password"
                ? "Setting password…"
                : isSignUp
                  ? "Creating account…"
                  : "Signing in…"
          }
        >
          {awaitingConfirmation
            ? "Confirm email"
            : challenge === "email-code"
              ? "Confirm code"
              : challenge === "new-password"
                ? "Set password"
                : isSignUp
                  ? "Create founder account"
                  : "Sign in"}
        </PrimaryButton>
      </form>

      <p className={styles.footer}>
        {awaitingConfirmation
          ? ""
          : isSignUp
            ? "Already have an account? "
            : "New to Nomad? "}
        <Link href={isSignUp ? "/sign-in" : "/sign-up"}>
          {awaitingConfirmation
            ? "Return to sign in"
            : isSignUp
              ? "Sign in"
              : "Create an account"}
        </Link>
      </p>
      {awaitingConfirmation && (
        <p className={styles.explanation}>
          You’ll be signed in automatically when confirmation succeeds.
        </p>
      )}
    </AuthLayout>
  );
}
