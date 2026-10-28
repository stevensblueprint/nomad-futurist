import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const configure = vi.fn();

vi.mock("aws-amplify", () => ({
  Amplify: { configure },
}));

describe("shared Amplify configuration", () => {
  beforeEach(() => {
    configure.mockClear();
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-east-1_example");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_APP_CLIENT_ID", "client-id");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("configures the email Cognito client once", async () => {
    await import("./amplify");
    expect(configure).toHaveBeenCalledTimes(1);
    expect(configure).toHaveBeenCalledWith({
      Auth: {
        Cognito: {
          userPoolId: "us-east-1_example",
          userPoolClientId: "client-id",
          loginWith: { email: true },
          signUpVerificationMethod: "code",
          userAttributes: { email: { required: true } },
          passwordFormat: {
            minLength: 8,
            requireLowercase: true,
            requireUppercase: true,
            requireNumbers: true,
            requireSpecialCharacters: true,
          },
        },
      },
    });
  });
});
