import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isTerminalPlannerAuthCode,
  parsePlannerAuthCodeFromText,
  reauthDemand,
} from "./plannerSessionRedirect.js";
import {
  EsiCredentialError,
  ESI_CREDENTIAL_REAUTH_REQUIRED,
  ESI_CREDENTIAL_RECOVERABLE,
} from "./esiCredentials/errors.js";
import { TAB_REAUTH_REQUIRED_AT_KEY } from "./tabSessionStorage.js";

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
