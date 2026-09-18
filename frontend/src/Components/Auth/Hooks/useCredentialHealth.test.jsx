import { beforeEach, describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";

import { useCredentialHealth } from "./useCredentialHealth.jsx";
import {
  CREDENTIAL_HEALTH,
  recordCredentialHealth,
  resetCredentialHealth,
} from "../../../Functions/Auth/esiCredentials/health.js";

describe("what a row knows about a character's credentials", () => {
  beforeEach(() => {
    resetCredentialHealth();
  });

  it("starts from what has been asked of them, which is nothing", () => {
    const { result } = renderHook(() => useCredentialHealth("hash-1"));

    expect(result.current.state).toBe(CREDENTIAL_HEALTH.UNKNOWN);
  });

  // The provider records outcomes from wherever a token is acquired, so a row that read the record
  // once would keep saying whatever it said when it mounted.
  it("follows the record as acquisitions happen", () => {
    const { result } = renderHook(() => useCredentialHealth("hash-1"));

    act(() => {
      recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.OK);
    });
    expect(result.current.state).toBe(CREDENTIAL_HEALTH.OK);

    act(() => {
      recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.REAUTH_REQUIRED);
    });
    expect(result.current.state).toBe(CREDENTIAL_HEALTH.REAUTH_REQUIRED);
  });

  it("answers for its own character and not another", () => {
    const { result } = renderHook(() => useCredentialHealth("hash-1"));

    act(() => {
      recordCredentialHealth("hash-2", CREDENTIAL_HEALTH.REAUTH_REQUIRED);
    });

    expect(result.current.state).toBe(CREDENTIAL_HEALTH.UNKNOWN);
  });

  it("stops listening once the row is gone", () => {
    const { unmount } = renderHook(() => useCredentialHealth("hash-1"));

    unmount();

    // A record written after the row unmounted must not reach a torn-down subscriber.
    expect(() =>
      recordCredentialHealth("hash-1", CREDENTIAL_HEALTH.OK),
    ).not.toThrow();
  });
});
