import assert from "node:assert/strict";
import test from "node:test";
import {
  isSuccessfulRegistrationResponse,
  projectsEndpoint,
  registrationPayload,
  validateRegistration,
} from "./registration-utils.ts";

const complete = {
  projectName: " Example Project ",
  description: "A useful description.",
  linkedInUrl: " https://example.com/project ",
  supportType: "both",
  needs: "Technical mentorship.",
  minimum: "10000",
  maximum: "50000",
};

test("validates required values, URL protocol, and ordered USD bounds", () => {
  assert.deepEqual(validateRegistration(complete), {});
  assert.equal(validateRegistration({ ...complete, projectName: "  " }).projectName, "Enter a project name.");
  assert.equal(validateRegistration({ ...complete, linkedInUrl: "javascript:alert(1)" }).linkedInUrl, "Enter an absolute HTTP or HTTPS URL.");
  assert.equal(validateRegistration({ ...complete, linkedInUrl: "https:example.com" }).linkedInUrl, "Enter an absolute HTTP or HTTPS URL.");
  assert.equal(validateRegistration({ ...complete, minimum: "50001" }).maximum, "Maximum must be at least the minimum.");
  assert.equal(validateRegistration({ ...complete, maximum: "Infinity" }).maximum, "Enter a nonnegative amount.");
});

test("normalizes the request and omits funding for human capital only", () => {
  assert.deepEqual(registrationPayload(complete), {
    projectName: "Example Project",
    description: "A useful description.",
    linkedInUrl: "https://example.com/project",
    supportType: "both",
    needs: "Technical mentorship.",
    fundingRange: { minimum: 10000, maximum: 50000 },
    visionDocument: null,
  });
  assert.equal(registrationPayload({ ...complete, linkedInUrl: "", supportType: "human_capital" }).linkedInUrl, null);
  assert.equal(registrationPayload({ ...complete, supportType: "human_capital" }).fundingRange, null);
});

test("builds the projects endpoint with a stage prefix or trailing slash", () => {
  assert.equal(projectsEndpoint("https://api.example.test/dev/"), "https://api.example.test/dev/projects");
});

test("accepts only a normalized draft response with a UUID", () => {
  const expected = registrationPayload(complete);
  const validResponse = {
    projectId: "f5c4d23a-5b41-4b14-8346-1f9c9b570890",
    ...expected,
    status: "draft",
  };
  assert.equal(isSuccessfulRegistrationResponse(validResponse, expected), true);
  assert.equal(isSuccessfulRegistrationResponse({ ...validResponse, fundingRange: { maximum: 50000, minimum: 10000 } }, expected), true);
  assert.equal(isSuccessfulRegistrationResponse({ ...validResponse, status: "submitted" }, expected), false);
  assert.equal(isSuccessfulRegistrationResponse({ ...validResponse, projectId: "temporary" }, expected), false);
  assert.equal(isSuccessfulRegistrationResponse({ ...validResponse, fundingRange: null }, expected), false);
});
