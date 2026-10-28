import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AuthForm from "./AuthForm";

const { signIn, confirmSignIn, signUp, confirmSignUp, autoSignIn, push } =
  vi.hoisted(() => ({
    signIn: vi.fn(),
    confirmSignIn: vi.fn(),
    signUp: vi.fn(),
    confirmSignUp: vi.fn(),
    autoSignIn: vi.fn(),
    push: vi.fn(),
  }));

vi.mock("../lib/amplify", () => ({}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("aws-amplify/auth", () => ({
  signUp,
  confirmSignUp,
  autoSignIn,
  signIn,
  confirmSignIn,
}));

describe("AuthForm sign-in challenges", () => {
  beforeEach(() => {
    signIn.mockReset();
    confirmSignIn.mockReset();
  });

  it("sets a new password when Cognito requires it", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
    });
    confirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    });

    render(<AuthForm mode="sign-in" />);
    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "TempPass1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "NewPass1!");
    await user.type(screen.getByLabelText("Confirm new password"), "NewPass1!");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    expect(confirmSignIn).toHaveBeenCalledWith({ challengeResponse: "NewPass1!" });
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
  });

  it("submits the email code and reports success", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" },
    });
    confirmSignIn.mockResolvedValue({
      isSignedIn: true,
      nextStep: { signInStep: "DONE" },
    });

    render(<AuthForm mode="sign-in" />);
    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "TempPass1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const code = await screen.findByLabelText("Email code");
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(confirmSignIn).toHaveBeenCalledWith({ challengeResponse: "123456" });
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
  });

  it("chains a new-password challenge into an email-code challenge", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
    });
    confirmSignIn
      .mockResolvedValueOnce({
        isSignedIn: false,
        nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_EMAIL_CODE" },
      })
      .mockResolvedValue({
        isSignedIn: true,
        nextStep: { signInStep: "DONE" },
      });

    render(<AuthForm mode="sign-in" />);
    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "TempPass1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "NewPass1!");
    await user.type(screen.getByLabelText("Confirm new password"), "NewPass1!");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    const code = await screen.findByLabelText("Email code");
    await user.type(code, "654321");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(confirmSignIn).toHaveBeenNthCalledWith(1, {
      challengeResponse: "NewPass1!",
    });
    expect(confirmSignIn).toHaveBeenNthCalledWith(2, {
      challengeResponse: "654321",
    });
    expect(await screen.findByText("Signed in.")).toBeInTheDocument();
  });

  it("asks for an email code for an OTP challenge", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_OTP" },
    });

    render(<AuthForm mode="sign-in" />);
    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "TempPass1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByLabelText("Email code")).toBeInTheDocument();
    expect(screen.queryByText("Signed in.")).not.toBeInTheDocument();
  });

  it("does not report success unless confirmSignIn signs the user in", async () => {
    const user = userEvent.setup();
    signIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED" },
    });
    confirmSignIn.mockResolvedValue({
      isSignedIn: false,
      nextStep: { signInStep: "DONE" },
    });

    render(<AuthForm mode="sign-in" />);
    await user.type(screen.getByLabelText("Email address"), "admin@example.com");
    await user.type(screen.getByLabelText("Password"), "TempPass1!");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByLabelText("New password")).toBeInTheDocument();
    await user.type(screen.getByLabelText("New password"), "NewPass1!");
    await user.type(screen.getByLabelText("Confirm new password"), "NewPass1!");
    await user.click(screen.getByRole("button", { name: "Set password" }));

    expect(
      await screen.findByText("Additional sign-in verification is required."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Signed in.")).not.toBeInTheDocument();
  });
});

describe("AuthForm sign-up confirmation", () => {
  beforeEach(() => {
    signUp.mockReset();
    confirmSignUp.mockReset();
    autoSignIn.mockReset();
    push.mockReset();
  });

  async function reachConfirmationStep(user: ReturnType<typeof userEvent.setup>) {
    signUp.mockResolvedValue({
      isSignUpComplete: false,
      nextStep: { signUpStep: "CONFIRM_SIGN_UP" },
    });

    render(<AuthForm mode="sign-up" />);
    await user.type(screen.getByLabelText("Email address"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "NewPass1!");
    await user.type(screen.getByLabelText("Confirm password"), "NewPass1!");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    return screen.findByLabelText("Email code");
  }

  it("confirms the code, signs in automatically, and opens registration", async () => {
    const user = userEvent.setup();
    confirmSignUp.mockResolvedValue({});
    autoSignIn.mockResolvedValue({ isSignedIn: true });

    await user.type(await reachConfirmationStep(user), "123456");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/registration"));
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({ autoSignIn: true }),
      }),
    );
    expect(confirmSignUp).toHaveBeenCalledWith({
      username: "new@example.com",
      confirmationCode: "123456",
    });
  });

  it("shows the Cognito message and does not redirect when the code is wrong", async () => {
    const user = userEvent.setup();
    confirmSignUp.mockRejectedValue(
      Object.assign(new Error("Invalid verification code provided."), {
        name: "CodeMismatchException",
      }),
    );

    await user.type(await reachConfirmationStep(user), "000000");
    await user.click(screen.getByRole("button", { name: "Confirm" }));

    expect(
      await screen.findByText("Invalid verification code provided."),
    ).toBeInTheDocument();
    expect(autoSignIn).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
