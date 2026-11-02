import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AuthForm from "./AuthForm";

const auth = vi.hoisted(() => ({
  signUp: vi.fn(),
  signIn: vi.fn(),
  confirmSignUp: vi.fn(),
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
