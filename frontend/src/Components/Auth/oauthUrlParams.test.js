import { afterEach, describe, expect, it } from "vitest";
import { buildAdditionalAccountState } from "./additionalAccountImport.js";
import {
  getAuthCallbackParams,
  storeOriginalPathFromOAuthState,
} from "./oauthUrlParams.js";

describe("getAuthCallbackParams", () => {
  it("reads the code and state EVE SSO returns", () => {
    expect(getAuthCallbackParams("?code=abc123&state=main")).toEqual({
      authCode: "abc123",
      state: "main",
    });
  });

  it("is null for a callback carrying neither", () => {
    expect(getAuthCallbackParams("?error=access_denied")).toEqual({
      authCode: null,
      state: null,
    });
  });
});

describe("storeOriginalPathFromOAuthState", () => {
  afterEach(() => {
    localStorage.removeItem("originalPath");
  });

  it("does not store a nonce-carrying additional-import state", () => {
    storeOriginalPathFromOAuthState(
      buildAdditionalAccountState("11111111-2222-3333-4444-555555555555")
    );
    expect(localStorage.getItem("originalPath")).toBeNull();
  });

  it("stores a return path", () => {
    storeOriginalPathFromOAuthState("/job-planner");
    expect(localStorage.getItem("originalPath")).toBe("/job-planner");
  });
});
