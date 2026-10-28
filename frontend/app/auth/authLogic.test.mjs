import assert from "node:assert/strict";
import test from "node:test";
import { getSignInOutcome, validatePassword } from "./authLogic.ts";

test("accepts passwords at and above the minimum length with every required character type", () => {
  assert.deepEqual(validatePassword("Abcdef1!"), []);
  assert.deepEqual(validatePassword("A longer password 1!"), []);
});

test("reports every missing requirement for an empty password", () => {
  assert.deepEqual(validatePassword(""), [
    "At least 8 characters.",
    "At least one lowercase letter.",
    "At least one uppercase letter.",
    "At least one number.",
    "At least one special character.",
  ]);
});

for (const [password, issue] of [
  ["Abcde1!", "At least 8 characters."],
  ["ABCDEF1!", "At least one lowercase letter."],
  ["abcdef1!", "At least one uppercase letter."],
  ["Abcdefg!", "At least one number."],
  ["Abcdef12", "At least one special character."],
  ["Abcdef1 ", "At least one special character."],
  ["Abcdef1\t", "At least one special character."],
]) {
  test(`rejects ${JSON.stringify(password)} with only its missing requirement`, () => {
    assert.deepEqual(validatePassword(password), [issue]);
  });
}

test("a completed sign-in succeeds regardless of the next step", () => {
  for (const signInStep of ["DONE", "CONFIRM_SIGN_UP", "RESET_PASSWORD"]) {
    assert.deepEqual(getSignInOutcome({ isSignedIn: true, nextStep: { signInStep } }), {
      isSignedIn: true,
    });
  }
});

test("an unconfirmed account gets confirmation guidance", () => {
  assert.deepEqual(getSignInOutcome({
    isSignedIn: false,
    nextStep: { signInStep: "CONFIRM_SIGN_UP" },
  }), {
    isSignedIn: false,
    message: "Confirm your account before signing in. Check your email for a confirmation code.",
  });
});

test("a required password reset gets support guidance", () => {
  assert.deepEqual(getSignInOutcome({
    isSignedIn: false,
    nextStep: { signInStep: "RESET_PASSWORD" },
  }), {
    isSignedIn: false,
    message: "Your password must be reset before you can sign in. Contact the Nomad team for help.",
  });
});

test("unsupported or unknown sign-in steps never count as a completed sign-in", () => {
  for (const signInStep of ["CONFIRM_SIGN_IN_WITH_SMS_CODE", "CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED", "UNKNOWN_STEP", "DONE"]) {
    assert.deepEqual(getSignInOutcome({ isSignedIn: false, nextStep: { signInStep } }), {
      isSignedIn: false,
      message: "Your account needs an additional sign-in step. This workflow cannot complete that step yet.",
    });
  }
});
