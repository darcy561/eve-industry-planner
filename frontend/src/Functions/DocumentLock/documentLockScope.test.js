import { describe, expect, it } from "vitest";
import {
  initialScopedDocumentLockState,
  scopeHasLeasePressure,
  scopeHasOtherSessionContention,
} from "./documentLockScope.js";

describe("scopeHasOtherSessionContention", () => {
  it("is false for uncontested holder", () => {
    expect(
      scopeHasOtherSessionContention({
        ...initialScopedDocumentLockState(),
        lockHeld: true,
        readOnly: false,
      })
    ).toBe(false);
  });

  it("is true when read-only or viewers / waitlist exist", () => {
    expect(
      scopeHasOtherSessionContention({
        ...initialScopedDocumentLockState(),
        readOnly: true,
      })
    ).toBe(true);
    expect(
      scopeHasOtherSessionContention({
        ...initialScopedDocumentLockState(),
        viewerCount: 1,
      })
    ).toBe(true);
    expect(
      scopeHasOtherSessionContention({
        ...initialScopedDocumentLockState(),
        waitlistLen: 1,
      })
    ).toBe(true);
  });
});

describe("scopeHasLeasePressure", () => {
  it("matches contention including passive viewers", () => {
    const withViewers = {
      ...initialScopedDocumentLockState(),
      lockHeld: true,
      viewerCount: 2,
    };
    expect(scopeHasLeasePressure(withViewers)).toBe(
      scopeHasOtherSessionContention(withViewers)
    );
    expect(scopeHasLeasePressure(withViewers)).toBe(true);
  });

  it("is true when waitlist or handoff pressure exists", () => {
    expect(
      scopeHasLeasePressure({
        ...initialScopedDocumentLockState(),
        waitlistLen: 1,
      })
    ).toBe(true);
    expect(
      scopeHasLeasePressure({
        ...initialScopedDocumentLockState(),
        pendingAccessRequest: true,
      })
    ).toBe(true);
  });
});
