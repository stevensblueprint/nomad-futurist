import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AuthForm from "./AuthForm";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  confirmSignUp: vi.fn(),
  confirmSignIn: vi.fn(),
  autoSignIn: vi.fn(),
  fetchAuthSession: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("aws-amplify/auth", () => auth);
vi.mock("./amplify-config", () => ({}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: auth.push, replace: auth.replace }),
}));

beforeEach(() => {
  vi.resetAllMocks();
  auth.fetchAuthSession.mockResolvedValue({});
  auth.signUp.mockResolvedValue({
    isSignUpComplete: false,
    nextStep: { signUpStep: "CONFIRM_SIGN_UP" },
  });
  auth.confirmSignUp.mockResolvedValue({ isSignUpComplete: true });
  auth.autoSignIn.mockResolvedValue({ isSignedIn: true });
});
afterEach(cleanup);

async function register() {
  const user = userEvent.setup();
  render(<AuthForm mode="sign-up" />);
  await user.type(
    screen.getByLabelText("Email address"),
    "founder@example.com",
  );
  await user.type(screen.getByLabelText("Password"), "ValidPass1!");
  await user.type(screen.getByLabelText("Confirm password"), "ValidPass1!");
  await user.click(
    screen.getByRole("button", { name: "Create founder account" }),
  );
  await screen.findByRole("heading", { name: "Check your email" });
  return user;
}

it("confirms with the pending email after removing the email input, then automatically signs in", async () => {
  const user = await register();
  expect(auth.signUp).toHaveBeenCalledWith({
    username: "founder@example.com",
    password: "ValidPass1!",
    options: {
      userAttributes: { email: "founder@example.com" },
      autoSignIn: true,
    },
  });
  expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  expect(
    screen.getByText(/We sent a code to founder@example.com/),
  ).toBeVisible();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  await user.type(screen.getByLabelText("Confirmation code"), "123456");
  await user.click(screen.getByRole("button", { name: "Confirm email" }));
  await waitFor(() =>
    expect(auth.confirmSignUp).toHaveBeenCalledWith({
      username: "founder@example.com",
      confirmationCode: "123456",
    }),
  );
  expect(auth.autoSignIn).toHaveBeenCalledOnce();
  expect(auth.push).toHaveBeenCalledWith("/");
});

it.each(["rejected", "incomplete"])(
  "returns to sign-in when auto sign-in is %s",
  async (outcome) => {
    if (outcome === "rejected")
      auth.autoSignIn.mockRejectedValue(new Error("Unavailable"));
    else auth.autoSignIn.mockResolvedValue({ isSignedIn: false });
    const user = await register();
    await user.type(screen.getByLabelText("Confirmation code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm email" }));
    await waitFor(() => expect(auth.push).toHaveBeenCalledWith("/sign-in"));
  },
);

it("keeps confirmation errors recoverable and requires a code", async () => {
  auth.confirmSignUp.mockRejectedValue({ name: "CodeMismatchException" });
  const user = await register();
  await user.click(screen.getByRole("button", { name: "Confirm email" }));
  expect(auth.confirmSignUp).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Confirmation code")).toHaveFocus();
  await user.type(screen.getByLabelText("Confirmation code"), "111111");
  await user.click(screen.getByRole("button", { name: "Confirm email" }));
  expect(await screen.findByRole("alert")).toBeVisible();
  expect(screen.getByLabelText("Confirmation code")).toBeEnabled();
});

it("rejects invalid passwords and mismatched confirmation before calling Amplify", async () => {
  const user = userEvent.setup();
  render(<AuthForm mode="sign-up" />);
  await user.type(
    screen.getByLabelText("Email address"),
    "founder@example.com",
  );
  await user.type(screen.getByLabelText("Password"), "short");
  await user.type(screen.getByLabelText("Confirm password"), "different");
  await user.click(
    screen.getByRole("button", { name: "Create founder account" }),
  );
  expect(auth.signUp).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Confirm password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

it("signs in with the existing credentials and redirects to home", async () => {
  auth.signIn.mockResolvedValue({ isSignedIn: true });
  const user = userEvent.setup();
  render(<AuthForm mode="sign-in" />);
  await user.type(
    await screen.findByLabelText("Email address"),
    "founder@example.com",
  );
  await user.type(screen.getByLabelText("Password"), "ValidPass1!");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  expect(auth.signIn).toHaveBeenCalledWith({
    username: "founder@example.com",
    password: "ValidPass1!",
  });
  await waitFor(() => expect(auth.replace).toHaveBeenCalledWith("/"));
});

it("redirects an existing authenticated session without displaying the sign-in form", async () => {
  auth.fetchAuthSession.mockResolvedValue({ tokens: { accessToken: "token" } });
  render(<AuthForm mode="sign-in" />);
  await waitFor(() => expect(auth.replace).toHaveBeenCalledWith("/"));
  expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
});

async function signInToChallenge(signInStep: string) {
  auth.signIn.mockResolvedValue({ isSignedIn: false, nextStep: { signInStep } });
  const user = userEvent.setup();
  render(<AuthForm mode="sign-in" />);
  await user.type(
    await screen.findByLabelText("Email address"),
    "admin@example.com",
  );
  await user.type(screen.getByLabelText("Password"), "TempPass1!");
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

async function setNewPassword(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("New password"), "NewPass1!");
  await user.type(screen.getByLabelText("Confirm new password"), "NewPass1!");
  await user.click(screen.getByRole("button", { name: "Set password" }));
}

it("sets a new password when Cognito requires it, then redirects home", async () => {
  auth.confirmSignIn.mockResolvedValue({
    isSignedIn: true,
    nextStep: { signInStep: "DONE" },
  });
  const user = await signInToChallenge(
    "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED",
  );

  expect(screen.queryByLabelText("Email address")).not.toBeInTheDocument();
  expect(await screen.findByLabelText("New password")).toHaveValue("");
  await setNewPassword(user);

  expect(auth.confirmSignIn).toHaveBeenCalledWith({
    challengeResponse: "NewPass1!",
  });
  await waitFor(() => expect(auth.replace).toHaveBeenCalledWith("/"));
});

it("rejects a weak or mismatched new password before calling Amplify", async () => {
  const user = await signInToChallenge(
    "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED",
  );
  await user.type(await screen.findByLabelText("New password"), "short");
  await user.type(screen.getByLabelText("Confirm new password"), "different");
  await user.click(screen.getByRole("button", { name: "Set password" }));

  expect(auth.confirmSignIn).not.toHaveBeenCalled();
  expect(screen.getByLabelText("New password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

it.each(["CONFIRM_SIGN_IN_WITH_EMAIL_CODE", "CONFIRM_SIGN_IN_WITH_OTP"])(
  "submits the email code for %s and redirects home",
  async (signInStep) => {
    auth.confirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    });
    const user = await signInToChallenge(signInStep);

    await user.type(await screen.findByLabelText("Email code"), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm code" }));

    expect(auth.confirmSignIn).toHaveBeenCalledWith({
      challengeResponse: "123456",
    });
    await waitFor(() => expect(auth.replace).toHaveBeenCalledWith("/"));
  },
);

it("requires an email code before calling Amplify", async () => {
  const user = await signInToChallenge("CONFIRM_SIGN_IN_WITH_EMAIL_CODE");
  await user.click(
    await screen.findByRole("button", { name: "Confirm code" }),
  );
  expect(auth.confirmSignIn).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Email code")).toHaveFocus();
});

it("chains a new-password challenge into an email-code challenge", async () => {
  auth.confirmSignIn
    .mockResolvedValueOnce({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" },
    })
    .mockResolvedValue({ isSignedIn: true, nextStep: { signInStep: "DONE" } });
  const user = await signInToChallenge(
    "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED",
  );
  await setNewPassword(user);

  await user.type(await screen.findByLabelText("Email code"), "654321");
  await user.click(screen.getByRole("button", { name: "Confirm code" }));

  expect(auth.confirmSignIn).toHaveBeenNthCalledWith(1, {
    challengeResponse: "NewPass1!",
  });
  expect(auth.confirmSignIn).toHaveBeenNthCalledWith(2, {
    challengeResponse: "654321",
  });
  await waitFor(() => expect(auth.replace).toHaveBeenCalledWith("/"));
});

it("does not redirect unless confirmSignIn signs the user in", async () => {
  auth.confirmSignIn.mockResolvedValue({
    isSignedIn: false,
    nextStep: { signInStep: "DONE" },
  });
  const user = await signInToChallenge(
    "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED",
  );
  await setNewPassword(user);

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "additional sign-in step",
  );
  expect(auth.replace).not.toHaveBeenCalled();
});
