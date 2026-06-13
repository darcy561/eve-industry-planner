import { beforeEach, describe, expect, it, vi } from "vitest";

const { useUsersStoreMock, storeRef } = vi.hoisted(() => {
  const ref = { current: null };
  const mock = Object.assign(
    function useUsersStore(selector) {
      return ref.current(selector);
    },
    {
      getState: () => ref.current.getState(),
      setState: (...args) => ref.current.setState(...args),
      subscribe: (...args) => ref.current.subscribe(...args),
    }
  );
  return { useUsersStoreMock: mock, storeRef: ref };
});

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

vi.mock("../../Zustand/usersStore", () => ({
  default: useUsersStoreMock,
}));

import { renderHook } from "@testing-library/react";
import { create } from "zustand";
import documentLockSlice from "../../Zustand/documentLockSlice.js";
import {
  USER_JOB_GROUPS_COLLECTION,
  USER_JOBS_COLLECTION,
} from "../../Functions/DocumentLock/documentLockCollections.js";
import {
  useActiveGroupLockReadOnly,
  useJobCardLockState,
  useJobLockReadOnly,
} from "./useDocumentLockState.js";

describe("useDocumentLockState", () => {
  beforeEach(() => {
    storeRef.current = create((set, get) => ({
      jobData: { activeGroupID: "group-1" },
      ...documentLockSlice(set, get),
    }));
  });

  it("useJobLockReadOnly is false for falsy jobID", () => {
    const { result } = renderHook(() => useJobLockReadOnly(null));
    expect(result.current).toBe(false);
  });

  it("useJobLockReadOnly reflects scope readOnly", () => {
    storeRef.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "job-9",
      { readOnly: true }
    );
    const { result } = renderHook(() => useJobLockReadOnly("job-9"));
    expect(result.current).toBe(true);
  });

  it("useActiveGroupLockReadOnly uses jobData.activeGroupID", () => {
    storeRef.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOB_GROUPS_COLLECTION,
      "group-1",
      { readOnly: true }
    );
    const { result } = renderHook(() => useActiveGroupLockReadOnly());
    expect(result.current).toBe(true);
  });

  it("useJobCardLockState combines job and group read-only on planner", () => {
    storeRef.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "job-1",
      { readOnly: true }
    );
    const { result } = renderHook(() =>
      useJobCardLockState({ jobID: "job-1", groupReadOnly: false })
    );
    expect(result.current.cardLocked).toBe(true);
    expect(result.current.jobReadOnly).toBe(true);
    expect(result.current.reason).toContain("job");
  });

  it("useJobCardLockState ignores per-job read-only when subordinate to group", () => {
    storeRef.current.getState().documentLock.actions.patchDocumentLockForScope(
      USER_JOBS_COLLECTION,
      "job-1",
      { readOnly: true }
    );
    const { result } = renderHook(() =>
      useJobCardLockState({
        jobID: "job-1",
        groupReadOnly: false,
        jobLockSubordinateToGroup: true,
      })
    );
    expect(result.current.cardLocked).toBe(false);
  });
});
