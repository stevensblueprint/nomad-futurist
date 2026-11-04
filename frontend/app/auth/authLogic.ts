export const passwordRequirements = [
  { message: "At least 8 characters", test: (password: string) => password.length >= 8 },
  { message: "At least one lowercase letter", test: (password: string) => /[a-z]/.test(password) },
  { message: "At least one uppercase letter", test: (password: string) => /[A-Z]/.test(password) },
  { message: "At least one number", test: (password: string) => /[0-9]/.test(password) },
  { message: "At least one special character", test: (password: string) => /[^A-Za-z0-9\s]/.test(password) },
] as const;

export function validatePassword(password: string): string[] {
  return passwordRequirements
    .filter((requirement) => !requirement.test(password))
    .map((requirement) => `${requirement.message}.`);
}

export function getSignInOutcome(result: {
  isSignedIn: boolean;
  nextStep: { signInStep: string };
}) {
  if (result.isSignedIn) return { isSignedIn: true as const };
  const message = result.nextStep.signInStep === "CONFIRM_SIGN_UP"
    ? "Confirm your account before signing in. Check your email for a confirmation code."
    : result.nextStep.signInStep === "RESET_PASSWORD"
      ? "Your password must be reset before you can sign in. Contact the Nomad team for help."
      : "Your account needs an additional sign-in step. This workflow cannot complete that step yet.";
  return { isSignedIn: false as const, message };
}
