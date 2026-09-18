import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREDENTIAL_HEALTH,
  credentialHealth,
  forgetCredentialHealth,
  recordCredentialHealth,
  resetCredentialHealth,
  subscribeToCredentialHealth,
} from "./health.js";

const HASH = "owner-hash";

describe("credential health", () => {
  beforeEach(() => {
    resetCredentialHealth();
  });

  it("knows nothing about a character nothing has been asked of", () => {
    expect(credentialHealth(HASH).state).toBe(CREDENTIAL_HEALTH.UNKNOWN);
  });

  it("tells its readers when a character's state changes", () => {
    const listener = vi.fn();
    subscribeToCredentialHealth(listener);

    recordCredentialHealth(HASH, CREDENTIAL_HEALTH.OK, 10);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(credentialHealth(HASH)).toEqual({
      state: CREDENTIAL_HEALTH.OK,
      at: 10,
    });
  });

  // Every background refresh records the same success. A fresh record for an unchanged state is a
  // new object, and the rows reading it through useSyncExternalStore would re-render on each one.
  it("keeps the same record when the state has not moved", () => {
    const listener = vi.fn();
    recordCredentialHealth(HASH, CREDENTIAL_HEALTH.OK, 10);
    const first = credentialHealth(HASH);
    subscribeToCredentialHealth(listener);

    recordCredentialHealth(HASH, CREDENTIAL_HEALTH.OK, 20);

    expect(credentialHealth(HASH)).toBe(first);
    expect(listener).not.toHaveBeenCalled();
  });

  it("forgets one character without disturbing the rest", () => {
    recordCredentialHealth(HASH, CREDENTIAL_HEALTH.OK);
    recordCredentialHealth("other", CREDENTIAL_HEALTH.REAUTH_REQUIRED);

    forgetCredentialHealth(HASH);

    expect(credentialHealth(HASH).state).toBe(CREDENTIAL_HEALTH.UNKNOWN);
    expect(credentialHealth("other").state).toBe(
      CREDENTIAL_HEALTH.REAUTH_REQUIRED,
    );
  });
});
