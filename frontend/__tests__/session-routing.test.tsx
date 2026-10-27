import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  fetchAuthSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("next/navigation", () => {
  const router = { replace: mocks.replace };
  return { useRouter: () => router };
});
vi.mock("aws-amplify/utils", () => ({ Hub: { listen: () => () => {} } }));
vi.mock("aws-amplify/auth", () => ({
  fetchAuthSession: () => mocks.fetchAuthSession(),
  signOut: () => mocks.signOut(),
}));

import ProtectedLayout from "../app/(protected)/layout";
import PublicOnly from "../app/components/PublicOnly";
import SignOutButton from "../app/components/SignOutButton";

const signedIn = { tokens: { accessToken: {} } };
const signedOut = { tokens: undefined };

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe("protected routes", () => {
  it("redirects signed-out users to /sign-up and hides content", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedOut);
    render(<ProtectedLayout><p>secret</p></ProtectedLayout>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-up"));
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("shows content to signed-in users without redirecting", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    render(<ProtectedLayout><p>secret</p></ProtectedLayout>);
    expect(await screen.findByText("secret")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("does not redirect or show content while loading", () => {
    mocks.fetchAuthSession.mockReturnValue(new Promise(() => {}));
    render(<ProtectedLayout><p>secret</p></ProtectedLayout>);
    expect(screen.queryByText("secret")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("public routes", () => {
  it("redirects signed-in users to /", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedIn);
    render(<PublicOnly><p>form</p></PublicOnly>);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("form")).toBeNull();
  });

  it("shows the form to signed-out users", async () => {
    mocks.fetchAuthSession.mockResolvedValue(signedOut);
    render(<PublicOnly><p>form</p></PublicOnly>);
    expect(await screen.findByText("form")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});

describe("sign out", () => {
  it("calls signOut once on double-click, then redirects to /sign-up", async () => {
    let finish!: () => void;
    mocks.signOut.mockReturnValue(new Promise<void>((r) => (finish = r)));
    render(<SignOutButton />);

    const button = screen.getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/sign-up"));
  });

  it("shows an error and allows retry when signOut fails", async () => {
    mocks.signOut.mockRejectedValueOnce(new Error("network"));
    render(<SignOutButton />);

    fireEvent.click(screen.getByRole("button"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(false);
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});