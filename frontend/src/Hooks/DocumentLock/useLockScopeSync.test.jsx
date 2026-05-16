import { renderHook, act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useLockScopeSync } from "./useLockScopeSync.js";
import {
  DOCUMENT_LOCK_CUSTOM_EVENT,
  DOCUMENT_LOCK_DOMAIN_EVENTS,
} from "../../Functions/DocumentLock/documentLockEvents.js";
import { USER_JOBS_COLLECTION } from "../../Functions/DocumentLock/documentLockCollections.js";
import { LOCK_SCOPE_SYNC_DEBOUNCE_MS } from "../../Functions/DocumentLock/documentLockTimings.js";

const patchPlannerJobLockScopeFromApi = vi.fn();
const patchPlannerGroupLockScopeFromApi = vi.fn();

vi.mock("./plannerLockScopeFromApi.js", () => ({
  patchPlannerJobLockScopeFromApi: (...a) => patchPlannerJobLockScopeFromApi(...a),
  patchPlannerGroupLockScopeFromApi: (...a) =>
    patchPlannerGroupLockScopeFromApi(...a),
}));

vi.mock("../../Functions/Endpoints/Pirivate/documentLockClient.js", () => ({
  getDocumentLockStateBatch: vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ jobResults: {}, groupResults: {} }),
  }),
  MAX_STATUS_BATCH_DOC_IDS: 500,
}));

const storeState = {
  account: { isLoggedIn: true },
  jobData: {
    jobArray: [{ jobID: "j-scope" }],
    groupArray: [],
  },
};

vi.mock("../../Zustand/usersStore.js", () => ({
  __esModule: true,
  default: (selector) => selector(storeState),
}));

function dispatchDocLock(detail) {
  window.dispatchEvent(
    new CustomEvent(DOCUMENT_LOCK_CUSTOM_EVENT, { detail })
  );
}

describe("useLockScopeSync — eip-document-lock (regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    storeState.account.isLoggedIn = true;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not refetch planner job scope on document_lock_requested (edit-job listener owns snackbar)", async () => {
    const { unmount } = renderHook(() =>
      useLockScopeSync({
        getJobIDs: () => ["j-scope"],
        getGroupIDs: () => [],
        trackGroups: false,
        chunkSize: 500,
      })
    );

    await act(async () => {
      dispatchDocLock({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.REQUESTED,
        collection: USER_JOBS_COLLECTION,
        docID: "j-scope",
        requesterSessionID: "sess-a",
      });
    });

    expect(patchPlannerJobLockScopeFromApi).not.toHaveBeenCalled();

    await act(async () => {
      dispatchDocLock({
        event: DOCUMENT_LOCK_DOMAIN_EVENTS.ACQUIRED,
        type: DOCUMENT_LOCK_DOMAIN_EVENTS.ACQUIRED,
        collection: USER_JOBS_COLLECTION,
        docID: "j-scope",
      });
    });

    expect(patchPlannerJobLockScopeFromApi).toHaveBeenCalledWith("j-scope");

    unmount();
  });

  it("debounced batch still schedules without throwing (timer fires)", async () => {
    const { unmount } = renderHook(() =>
      useLockScopeSync({
        getJobIDs: () => ["j-scope"],
        getGroupIDs: () => [],
        trackGroups: false,
        chunkSize: 500,
      })
    );

    await act(async () => {
      vi.advanceTimersByTime(LOCK_SCOPE_SYNC_DEBOUNCE_MS + 10);
    });

    const { getDocumentLockStateBatch } = await import(
      "../../Functions/Endpoints/Pirivate/documentLockClient.js"
    );
    expect(getDocumentLockStateBatch).toHaveBeenCalled();

    unmount();
  });
});
