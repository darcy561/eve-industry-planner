import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { create } from "zustand";

vi.mock("../../Functions/Endpoints/Pirivate/documentLockClient.js", () => ({
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

import documentLockSlice from "../../Zustand/documentLockSlice.js";
import { LOCK_STATUS_SYNC_INTERVAL_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import { useLockSyncHeartbeat } from "./useLockSyncHeartbeat.js";

const storeHolder = { current: null };

vi.mock("../../Zustand/usersStore.js", () => ({
  default: {
    getState: () => storeHolder.current.getState(),
    setState: (...args) => storeHolder.current.setState(...args),
    subscribe: (...args) => storeHolder.current.subscribe(...args),
  },
}));

describe("useLockSyncHeartbeat", () => {
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

  it("does not schedule when disabled or docID missing", () => {
    const syncLockFromServer = vi.fn();
    const flushExtendLease = vi.fn();
    const { unmount } = renderHook(() =>
      useLockSyncHeartbeat({
        enabled: false,
        docID: "j1",
        collection: "account_job_documents",
        syncLockFromServer,
        flushExtendLease,
      })
    );
    vi.advanceTimersByTime(LOCK_STATUS_SYNC_INTERVAL_MS * 3);
    expect(syncLockFromServer).not.toHaveBeenCalled();
    unmount();
  });

  it("calls syncLockFromServer on the status interval", () => {
    const syncLockFromServer = vi.fn().mockResolvedValue(undefined);
    const flushExtendLease = vi.fn();
    const { unmount } = renderHook(() =>
      useLockSyncHeartbeat({
        enabled: true,
        docID: "j1",
        collection: "account_job_documents",
        syncLockFromServer,
        flushExtendLease,
      })
    );
    expect(syncLockFromServer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LOCK_STATUS_SYNC_INTERVAL_MS);
    expect(syncLockFromServer).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LOCK_STATUS_SYNC_INTERVAL_MS);
    expect(syncLockFromServer).toHaveBeenCalledTimes(2);
    unmount();
  });
});
