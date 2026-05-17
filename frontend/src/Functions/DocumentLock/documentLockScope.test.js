import { describe, expect, it } from "vitest";
import {
  initialScopedDocumentLockState,
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
