import { describe, it, expect, beforeEach } from "vitest";
import {
  EIP_ESI_OAUTH_STORAGE_COOKIE,
  clearClientReadablePlannerAuthCookies,
  hasCloudOAuthStorageServerHint,
} from "../src/Functions/Auth/plannerAuthCookies.js";

describe("plannerAuthCookies", () => {
  beforeEach(() => {
    document.cookie = `${EIP_ESI_OAUTH_STORAGE_COOKIE}=server; Path=/`;
  });

  it("clears esi oauth storage hint cookie", () => {
    expect(hasCloudOAuthStorageServerHint()).toBe(true);
    clearClientReadablePlannerAuthCookies();
    expect(hasCloudOAuthStorageServerHint()).toBe(false);
  });
});
