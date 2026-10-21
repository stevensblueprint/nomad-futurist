export function authErrorMessage(error: unknown): string {
  const name = error instanceof Object && "name" in error ? error.name : undefined;
  const status = error instanceof Object && "$metadata" in error
    ? (error.$metadata as { httpStatusCode?: number } | undefined)?.httpStatusCode
    : undefined;

  switch (name) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "Incorrect email or password. Check your details and try again.";
    case "UsernameExistsException":
      return "An account with that email already exists. Sign in instead.";
    case "InvalidPasswordException":
      return "This password does not meet the required password policy. Check the requirements and try again.";
    case "CodeMismatchException":
      return "That confirmation code is incorrect. Check the code and try again.";
    case "ExpiredCodeException":
      return "That confirmation code has expired. Request a new code and try again.";
    case "CodeDeliveryFailureException":
      return "We could not deliver the confirmation code. Please try again later.";
    case "NetworkError":
    case "TimeoutError":
      return "We couldn't reach the sign-in service. Check your internet connection and try again.";
    case "InternalErrorException":
    case "ServiceUnavailableException":
      return "The sign-in service is temporarily unavailable. Please try again later.";
    case "TooManyRequestsException":
    case "LimitExceededException":
    case "TooManyFailedAttemptsException":
      return "Too many attempts. Wait a few minutes before trying again.";
    case "UserNotConfirmedException":
      return "Your email hasn't been confirmed yet. Confirm your account before signing in.";
    case "PasswordResetRequiredException":
      return "Your password must be reset before you can sign in. Contact the Nomad team for help.";
    case "UserAlreadyAuthenticatedException":
      return "An account is already signed in. Return to the home page to continue or sign out.";
    default:
      return typeof status === "number" && status >= 500
        ? "The sign-in service is temporarily unavailable. Please try again later."
        : "We couldn't complete your request. Please try again. If this continues, contact the Nomad team.";
  }
}
