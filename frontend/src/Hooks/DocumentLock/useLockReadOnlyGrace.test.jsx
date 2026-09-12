import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../Functions/Endpoints/Private/documentLockClient.js", () => ({
  acquireDocumentLock: vi.fn(),
  claimDocumentLockHandoff: vi.fn(),
  forceReleaseDocumentLockSameAccount: vi.fn(),
  handOverDocumentLock: vi.fn(),
  pulseDocumentLockWaitlist: vi.fn(),
  requestDocumentLockAccess: vi.fn(),
}));

vi.mock("../../Events/snackbarEvents.js", () => ({
  showSnackbarSuccess: vi.fn(),
  showSnackbarWarning: vi.fn(),
}));

vi.mock("../../Events/editJobReleaseRequestEvents.js", () => ({
  requestEditJobReleaseConfirmation: vi.fn(),
}));

vi.mock("../../Functions/DocumentLock/documentLockAcquireFeedback.js", () => ({
  suppressDocumentLockVacancyNotice: vi.fn(),
}));

import * as readOnlyGrace from "../../Functions/DocumentLock/readOnlyGrace.js";
import { LOCK_READONLY_GRACE_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import { useLockReadOnlyGrace } from "./useLockReadOnlyGrace.js";

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { sessionID: "s" } });
});

describe("useLockReadOnlyGrace", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("runs endReadOnlyGraceIfApplicable after the grace window", () => {
    const spy = vi.spyOn(readOnlyGrace, "endReadOnlyGraceIfApplicable");
    const { result } = renderHook(() => {
      const ref = useRef(null);
      const grace = useLockReadOnlyGrace(ref, "job_documents", "job-grace");
      return { grace, ref };
    });
    act(() => {
      result.current.grace.startReadOnlyGrace();
    });
    expect(result.current.ref.current).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(LOCK_READONLY_GRACE_MS);
    });
    expect(spy).toHaveBeenCalledWith("job_documents", "job-grace");
    expect(result.current.ref.current).toBeNull();
    spy.mockRestore();
  });

  it("cancelReadOnlyGrace prevents the grace callback", () => {
    const spy = vi.spyOn(readOnlyGrace, "endReadOnlyGraceIfApplicable");
    const { result } = renderHook(() => {
      const ref = useRef(null);
      const grace = useLockReadOnlyGrace(ref, "job_documents", "job-cancel");
      return { grace, ref };
    });
    act(() => {
      result.current.grace.startReadOnlyGrace();
      result.current.grace.cancelReadOnlyGrace();
    });
    act(() => {
      vi.advanceTimersByTime(LOCK_READONLY_GRACE_MS);
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
