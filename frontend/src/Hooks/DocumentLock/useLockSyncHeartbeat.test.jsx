import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../Functions/Endpoints/Private/documentLockClient.js", () => ({
  acquireDocumentLock: vi.fn(),
  claimDocumentLockHandoff: vi.fn(),
  forceReleaseDocumentLockSameAccount: vi.fn(),
  handOverDocumentLock: vi.fn(),
  pulseDocumentLockWaitlist: vi.fn(),
  requestDocumentLockAccess: vi.fn(),
}));

vi.mock("../../Events/snackbarEvents.js", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../Events/editJobReleaseRequestEvents.js", () => ({
  requestEditJobReleaseConfirmation: vi.fn(),
}));

vi.mock("../../Functions/DocumentLock/documentLockAcquireFeedback.js", () => ({
  suppressDocumentLockVacancyNotice: vi.fn(),
}));

import { LOCK_STATUS_SYNC_INTERVAL_MS } from "../../Functions/DocumentLock/documentLockTimings.js";
import { useLockSyncHeartbeat } from "./useLockSyncHeartbeat.js";

vi.mock("../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } = await import("../../tests/usersStoreHarness.js");
  return usersStoreMock({ account: { sessionID: "s" } });
});

describe("useLockSyncHeartbeat", () => {
  beforeEach(() => {
    vi.useFakeTimers();
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
        collection: "job_documents",
        syncLockFromServer,
        flushExtendLease,
      }),
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
        collection: "job_documents",
        syncLockFromServer,
        flushExtendLease,
      }),
    );
    expect(syncLockFromServer).not.toHaveBeenCalled();
    vi.advanceTimersByTime(LOCK_STATUS_SYNC_INTERVAL_MS);
    expect(syncLockFromServer).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(LOCK_STATUS_SYNC_INTERVAL_MS);
    expect(syncLockFromServer).toHaveBeenCalledTimes(2);
    unmount();
  });
});
