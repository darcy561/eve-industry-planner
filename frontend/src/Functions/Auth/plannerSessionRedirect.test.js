import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { startSignIn, redirectToEveSSO } = vi.hoisted(() => ({
  startSignIn: vi.fn(async () => "a-sign-in-state"),
  redirectToEveSSO: vi.fn(),
}));
vi.mock("./signInState.js", () => ({ startSignIn }));
vi.mock("../../Components/Auth/Functions/eveSSORedirect", () => ({
  default: redirectToEveSSO,
}));

import {
  isTerminalPlannerAuthCode,
  parsePlannerAuthCodeFromText,
  reauthDemand,
  redirectToFullEveLogin,
} from "./plannerSessionRedirect.js";
import {
  EsiCredentialError,
  ESI_CREDENTIAL_REAUTH_REQUIRED,
  ESI_CREDENTIAL_RECOVERABLE,
} from "./esiCredentials/errors.js";
import {
  TAB_REAUTH_REQUIRED_AT_KEY,
  TAB_REFRESH_TOKEN_KEY,
} from "./tabSessionStorage.js";

describe("plannerSessionRedirect", () => {
  it("parses reauth_required from JSON body", () => {
    expect(
      parsePlannerAuthCodeFromText(
        JSON.stringify({ code: "reauth_required", message: "Unauthorized" }),
      ),
    ).toBe("reauth_required");
  });

  // The stuck-session defect: a plain-text 401 yields no code, so nothing redirects and the tab
  // retries a dead refresh token on every request.
  it("yields no code for an uncoded plain-text rejection", () => {
    expect(parsePlannerAuthCodeFromText("Invalid token\n")).toBeNull();
  });

  it("treats reauth_required and session_revoked as terminal", () => {
    expect(isTerminalPlannerAuthCode("reauth_required")).toBe(true);
    expect(isTerminalPlannerAuthCode("session_revoked")).toBe(true);
    expect(isTerminalPlannerAuthCode("session_missing")).toBe(false);
  });
});

// The three vocabularies a reauth demand arrives in. Every caller holds one of them and
// none of them knows which, so the classifier is the only place that has to.
describe("reauthDemand", () => {
  beforeEach(() => {
    sessionStorage.removeItem(TAB_REAUTH_REQUIRED_AT_KEY);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads a passed deadline with no signal at all", () => {
    const past = Math.floor(Date.now() / 1000) - 60;
    sessionStorage.setItem(TAB_REAUTH_REQUIRED_AT_KEY, String(past));

    expect(reauthDemand()).toBe(true);
  });

  it("leaves a deadline still in the future alone", () => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    sessionStorage.setItem(TAB_REAUTH_REQUIRED_AT_KEY, String(future));

    expect(reauthDemand()).toBe(false);
  });

  it("reads a terminal code, however the caller holds it", () => {
    expect(reauthDemand("reauth_required")).toBe(true);
    expect(reauthDemand("session_revoked")).toBe(true);
    expect(reauthDemand({ code: "session_revoked" })).toBe(true);
    expect(reauthDemand(new Error("401: reauth_required"))).toBe(true);
  });

  it("reads an ESI credential that needs a fresh sign-in", () => {
    const err = new EsiCredentialError(
      "no refresh material",
      ESI_CREDENTIAL_REAUTH_REQUIRED,
    );

    expect(reauthDemand(err)).toBe(true);
  });

  // A rotate can still recover these, so treating them as terminal would send a reader
  // to EVE for something the next request would have fixed on its own.
  it("leaves a recoverable failure to the retry path", () => {
    expect(reauthDemand("session_missing")).toBe(false);
    expect(
      reauthDemand(
        new EsiCredentialError("timeout", ESI_CREDENTIAL_RECOVERABLE),
      ),
    ).toBe(false);
    expect(reauthDemand(new Error("Failed to fetch"))).toBe(false);
    expect(reauthDemand(null)).toBe(false);
  });
});

// Minting is what the redirect now waits on, and it runs before anything is torn
// down: a sign-in that cannot start must leave the tab able to try again.
describe("leaving for EVE SSO", () => {
  beforeEach(() => {
    sessionStorage.setItem(TAB_REFRESH_TOKEN_KEY, "a-refresh-token");
  });

  afterEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
  });

  it("mints a state, then clears the tab, then goes", async () => {
    await redirectToFullEveLogin("/jobplanner");

    expect(startSignIn).toHaveBeenCalled();
    expect(sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY)).toBeNull();
    expect(redirectToEveSSO).toHaveBeenCalledWith("/jobplanner");
  });

  it("leaves the tab alone when the state cannot be minted", async () => {
    startSignIn.mockRejectedValue(new Error("no state"));

    await expect(redirectToFullEveLogin()).rejects.toThrow("no state");

    expect(redirectToEveSSO).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY)).toBe(
      "a-refresh-token",
    );
  });
});
