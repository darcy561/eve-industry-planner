import { create } from "zustand";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../Functions/Endpoints/Pirivate/documentLockClient.js", () => ({
  acquireDocumentLock: vi.fn(),
  claimDocumentLockHandoff: vi.fn(),
  forceReleaseDocumentLockSameAccount: vi.fn(),
  handOverDocumentLock: vi.fn(),
  pulseDocumentLockWaitlist: vi.fn(),
  requestDocumentLockAccess: vi.fn(),
}));

vi.mock("../Events/snackbarEvents.js", () => ({
  showSnackbarSuccess: vi.fn(),
  showSnackbarWarning: vi.fn(),
}));

vi.mock("../Events/editJobReleaseRequestEvents.js", () => ({
  requestEditJobReleaseConfirmation: vi.fn(),
}));

vi.mock("../Functions/DocumentLock/documentLockAcquireFeedback.js", () => ({
  suppressDocumentLockVacancyNotice: vi.fn(),
}));

import documentLockSlice from "./documentLockSlice.js";
import {
  docLockScopeKey,
  initialScopedDocumentLockState,
} from "../Functions/DocumentLock/documentLockScope.js";

function createLockOnlyStore() {
  return create((set, get) => ({
    ...documentLockSlice(set, get),
  }));
}

describe("documentLockSlice", () => {
  /** @type {ReturnType<typeof createLockOnlyStore>} */
  let useStore;

  beforeEach(() => {
    useStore = createLockOnlyStore();
  });

  it("patchDocumentLockForScope merges into existing scope", () => {
    const k = docLockScopeKey("user_job_documents", "j1");
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "user_job_documents",
      "j1",
      { readOnly: true, lockHeld: false }
    );
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "user_job_documents",
      "j1",
      { viewerCount: 3 }
    );
    const s = useStore.getState().documentLock.scopes[k];
    expect(s.readOnly).toBe(true);
    expect(s.viewerCount).toBe(3);
  });

  it("patchDocumentLockForScope initialises missing scope from defaults", () => {
    const k = docLockScopeKey("user_job_documents", "new");
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "user_job_documents",
      "new",
      { lockHeld: true }
    );
    const s = useStore.getState().documentLock.scopes[k];
    expect(s.lockHeld).toBe(true);
    expect(s.readOnly).toBe(initialScopedDocumentLockState().readOnly);
  });

  it("patchDocumentLockForScope ignores empty collection or docID", () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope("", "x", {
      readOnly: true,
    });
    useStore.getState().documentLock.actions.patchDocumentLockForScope("c", "", {
      readOnly: true,
    });
    expect(useStore.getState().documentLock.scopes).toEqual({});
  });

  it("patchManyDocumentLockScopes applies multiple keys in one update", () => {
    const patches = [
      {
        collection: "user_job_documents",
        docID: "a",
        partial: { readOnly: true },
      },
      {
        collection: "user_job_documents",
        docID: "b",
        partial: { lockHeld: true },
      },
    ];
    useStore.getState().documentLock.actions.patchManyDocumentLockScopes(patches);
    const scopes = useStore.getState().documentLock.scopes;
    expect(scopes[docLockScopeKey("user_job_documents", "a")].readOnly).toBe(true);
    expect(scopes[docLockScopeKey("user_job_documents", "b")].lockHeld).toBe(true);
  });

  it("patchManyDocumentLockScopes skips invalid rows", () => {
    useStore.getState().documentLock.actions.patchManyDocumentLockScopes([
      null,
      { collection: "", docID: "x", partial: { readOnly: true } },
      { collection: "user_job_documents", docID: "ok", partial: { readOnly: true } },
      { collection: "user_job_documents", docID: "bad", partial: null },
    ]);
    const scopes = useStore.getState().documentLock.scopes;
    expect(Object.keys(scopes).length).toBe(1);
    expect(scopes[docLockScopeKey("user_job_documents", "ok")].readOnly).toBe(true);
  });

  it("patchManyDocumentLockScopes no-ops on empty or non-array", () => {
    useStore.getState().documentLock.actions.patchManyDocumentLockScopes([]);
    useStore.getState().documentLock.actions.patchManyDocumentLockScopes(
      /** @type {any} */ (undefined)
    );
    expect(useStore.getState().documentLock.scopes).toEqual({});
  });

  it("resetDocumentLockForScope removes one scope", () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "user_job_documents",
      "j1",
      { readOnly: true }
    );
    useStore.getState().documentLock.actions.resetDocumentLockForScope(
      "user_job_documents",
      "j1"
    );
    expect(useStore.getState().documentLock.scopes).toEqual({});
  });

  it("resetAllDocumentLocks clears every scope", () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "user_job_documents",
      "j1",
      { readOnly: true }
    );
    useStore.getState().documentLock.actions.resetAllDocumentLocks();
    expect(useStore.getState().documentLock.scopes).toEqual({});
  });
});
