import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

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
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import { useLockReadOnlyGrace } from "./useLockReadOnlyGrace.js";

const storeHolder = { current: null };

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
    subscribe: (...args) => storeHolder.current.subscribe(...args),
  },
}));

describe("useLockReadOnlyGrace", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    storeHolder.current = create((set, get) => ({
      account: { sessionID: "s" },
      ...documentLockSlice(set, get),
    }));
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("runs endReadOnlyGraceIfApplicable after the grace window", () => {
    const spy = vi.spyOn(readOnlyGrace, "endReadOnlyGraceIfApplicable");
    const { result } = renderHook(() => {
      const ref = useRef(null);
      const grace = useLockReadOnlyGrace(ref, "account_job_documents", "job-grace");
      return { grace, ref };
    });
    act(() => {
      result.current.grace.startReadOnlyGrace();
    });
    expect(result.current.ref.current).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(LOCK_READONLY_GRACE_MS);
    });
    expect(spy).toHaveBeenCalledWith("account_job_documents", "job-grace");
    expect(result.current.ref.current).toBeNull();
    spy.mockRestore();
  });

  it("cancelReadOnlyGrace prevents the grace callback", () => {
    const spy = vi.spyOn(readOnlyGrace, "endReadOnlyGraceIfApplicable");
    const { result } = renderHook(() => {
      const ref = useRef(null);
      const grace = useLockReadOnlyGrace(ref, "account_job_documents", "job-cancel");
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
