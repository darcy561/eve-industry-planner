import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TAB_REFRESH_TOKEN_KEY,
  TAB_REAUTH_REQUIRED_AT_KEY,
  hasResumablePlannerSession,
  persistTabPlannerSession,
} from "../src/Functions/Auth/tabSessionStorage.js";
import {
  EIP_ESI_OAUTH_STORAGE_COOKIE,
  clearClientReadablePlannerAuthCookies,
} from "../src/Functions/Auth/plannerAuthCookies.js";

function createStorage() {
  /** @type {Record<string, string>} */
  const store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
  };
}

describe("hasResumablePlannerSession", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", createStorage());
    sessionStorage.removeItem(TAB_REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(TAB_REAUTH_REQUIRED_AT_KEY);
    clearClientReadablePlannerAuthCookies();
    document.cookie = "";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false when only a tab planner refresh token is stored (local cannot resume without Auth)", () => {
    persistTabPlannerSession({ refreshToken: "tab-refresh-token" });
    expect(hasResumablePlannerSession()).toBe(false);
  });

  it("returns true when local ESI Auth refresh is stored", () => {
    localStorage.setItem("Auth", "eve-refresh-token");
    expect(hasResumablePlannerSession()).toBe(true);
  });

  it("returns true when cloud OAuth storage hint cookie is present", () => {
    document.cookie = `${EIP_ESI_OAUTH_STORAGE_COOKIE}=server; Path=/`;
    expect(hasResumablePlannerSession()).toBe(true);
  });

  it("returns false when the stored reauth deadline has passed", () => {
    document.cookie = `${EIP_ESI_OAUTH_STORAGE_COOKIE}=server; Path=/`;
    const past = Math.floor(Date.now() / 1000) - 60;
    sessionStorage.setItem(TAB_REAUTH_REQUIRED_AT_KEY, String(past));
    expect(hasResumablePlannerSession()).toBe(false);
  });

  it("returns false when no resume material exists", () => {
    expect(sessionStorage.getItem(TAB_REFRESH_TOKEN_KEY)).toBeNull();
    expect(hasResumablePlannerSession()).toBe(false);
  });
});
