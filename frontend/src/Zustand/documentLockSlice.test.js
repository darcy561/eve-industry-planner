import { create } from "zustand";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../Functions/Endpoints/Pirivate/documentLockClient.js", () => ({
  acquireDocumentLock: vi.fn(),
  claimDocumentLockHandoff: vi.fn(),
  forceReleaseDocumentLockSameAccount: vi.fn(),
  handOverDocumentLock: vi.fn(),
  postDocumentLockViewerDeparted: vi.fn(),
  pulseDocumentLockWaitlist: vi.fn(),
  releaseDocumentLock: vi.fn(),
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

const { mockResolveDocumentLockApiTarget } = vi.hoisted(() => ({
  mockResolveDocumentLockApiTarget: vi.fn((collection, docID) => ({
    collection,
    docID,
  })),
}));

vi.mock("../Functions/DocumentLock/resolveDocumentLockApiTarget.js", () => ({
  resolveDocumentLockApiTarget: (...args) =>
    mockResolveDocumentLockApiTarget(...args),
}));

import documentLockSlice from "./documentLockSlice.js";
import {
  acquireDocumentLock,
  claimDocumentLockHandoff,
  forceReleaseDocumentLockSameAccount,
  handOverDocumentLock,
  postDocumentLockViewerDeparted,
  pulseDocumentLockWaitlist,
  releaseDocumentLock,
  requestDocumentLockAccess,
} from "../Functions/Endpoints/Pirivate/documentLockClient.js";
import { suppressDocumentLockVacancyNotice } from "../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { showSnackbarSuccess, showSnackbarWarning } from "../Events/snackbarEvents.js";
import { requestEditJobReleaseConfirmation } from "../Events/editJobReleaseRequestEvents.js";
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
    mockResolveDocumentLockApiTarget.mockImplementation((collection, docID) => ({
      collection,
      docID,
    }));
  });

  it("patchDocumentLockForScope merges into existing scope", () => {
    const k = docLockScopeKey("account_job_documents", "j1");
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "account_job_documents",
      "j1",
      { readOnly: true, lockHeld: false }
    );
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "account_job_documents",
      "j1",
      { viewerCount: 3 }
    );
    const s = useStore.getState().documentLock.scopes[k];
    expect(s.readOnly).toBe(true);
    expect(s.viewerCount).toBe(3);
  });

  it("patchDocumentLockForScope initialises missing scope from defaults", () => {
    const k = docLockScopeKey("account_job_documents", "new");
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "account_job_documents",
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
        collection: "account_job_documents",
        docID: "a",
        partial: { readOnly: true },
      },
      {
        collection: "account_job_documents",
        docID: "b",
        partial: { lockHeld: true },
      },
    ];
    useStore.getState().documentLock.actions.patchManyDocumentLockScopes(patches);
    const scopes = useStore.getState().documentLock.scopes;
    expect(scopes[docLockScopeKey("account_job_documents", "a")].readOnly).toBe(true);
    expect(scopes[docLockScopeKey("account_job_documents", "b")].lockHeld).toBe(true);
  });

  it("patchManyDocumentLockScopes skips invalid rows", () => {
    useStore.getState().documentLock.actions.patchManyDocumentLockScopes([
      null,
      { collection: "", docID: "x", partial: { readOnly: true } },
      { collection: "account_job_documents", docID: "ok", partial: { readOnly: true } },
      { collection: "account_job_documents", docID: "bad", partial: null },
    ]);
    const scopes = useStore.getState().documentLock.scopes;
    expect(Object.keys(scopes).length).toBe(1);
    expect(scopes[docLockScopeKey("account_job_documents", "ok")].readOnly).toBe(true);
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
      "account_job_documents",
      "j1",
      { readOnly: true }
    );
    useStore.getState().documentLock.actions.resetDocumentLockForScope(
      "account_job_documents",
      "j1"
    );
    expect(useStore.getState().documentLock.scopes).toEqual({});
  });

  it("resetAllDocumentLocks clears every scope", () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(
      "account_job_documents",
      "j1",
      { readOnly: true }
    );
    useStore.getState().documentLock.actions.resetAllDocumentLocks();
    expect(useStore.getState().documentLock.scopes).toEqual({});
  });
});

describe("documentLockSlice — async lock flows (regression)", () => {
  /** @type {ReturnType<typeof createLockOnlyStore>} */
  let useStore;

  beforeEach(() => {
    vi.clearAllMocks();
    mockResolveDocumentLockApiTarget.mockImplementation((collection, docID) => ({
      collection,
      docID,
    }));
    useStore = createLockOnlyStore();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const collection = "account_job_documents";
  const docID = "job-regression-1";
  const scopeKey = docLockScopeKey(collection, docID);

  it("forceReleaseSameAccountEditLock: 201 grants lock to clearer", async () => {
    forceReleaseDocumentLockSameAccount.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        expiresAtUnix: 1_700_000_000,
        ttlSeconds: 300,
      }),
    });

    await useStore
      .getState()
      .documentLock.actions.forceReleaseSameAccountEditLock(collection, docID);

    expect(showSnackbarSuccess).toHaveBeenCalledWith(
      "Edit lock cleared — you now hold the lock.",
      3
    );
    expect(showSnackbarWarning).not.toHaveBeenCalled();
    expect(acquireDocumentLock).not.toHaveBeenCalled();
    expect(useStore.getState().documentLock.scopes[scopeKey]?.lockHeld).toBe(true);
    expect(useStore.getState().documentLock.scopes[scopeKey]?.readOnly).toBe(false);
  });

  it("requestAccess: 202 queues waitlist pulse path in scope", async () => {
    requestDocumentLockAccess.mockResolvedValue({
      ok: true,
      status: 202,
      json: vi.fn().mockResolvedValue({}),
    });

    await useStore.getState().documentLock.actions.requestAccess(collection, docID);

    expect(
      useStore.getState().documentLock.scopes[scopeKey]?.waitingInHandoffQueue
    ).toBe(true);
  });

  it("requestAccess: group member job calls POST /request on the group lock", async () => {
    mockResolveDocumentLockApiTarget.mockReturnValueOnce({
      collection: "account_job_groups",
      docID: "group-1",
    });
    requestDocumentLockAccess.mockResolvedValue({
      ok: true,
      status: 202,
      json: vi.fn().mockResolvedValue({}),
    });

    await useStore.getState().documentLock.actions.requestAccess(
      "account_job_documents",
      "job-in-group"
    );

    expect(requestDocumentLockAccess).toHaveBeenCalledWith(
      "account_job_groups",
      "group-1"
    );
    expect(
      useStore.getState().documentLock.scopes[
        docLockScopeKey("account_job_groups", "group-1")
      ]?.waitingInHandoffQueue
    ).toBe(true);
  });

  it("yieldDocumentLockOnLeave: releases when holder with no waitlist", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
      waitlistLen: 0,
    });
    let suppressWhenReleaseCalled;
    releaseDocumentLock.mockImplementation(async () => {
      suppressWhenReleaseCalled =
        useStore.getState().documentLock.scopes[scopeKey]?.suppressVacancyAcquire;
      return { ok: true, status: 204 };
    });

    await useStore.getState().documentLock.actions.yieldDocumentLockOnLeave(
      collection,
      docID
    );

    expect(releaseDocumentLock).toHaveBeenCalledWith(collection, docID);
    expect(handOverDocumentLock).not.toHaveBeenCalled();
    expect(suppressWhenReleaseCalled).toBe(true);
    const s = useStore.getState().documentLock.scopes[scopeKey];
    expect(s?.lockHeld).toBe(false);
    expect(s?.readOnly).toBe(false);
    expect(s?.suppressVacancyAcquire).toBe(true);
  });

  it("yieldDocumentLockOnLeave: hands over when waitlist has entries", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
      waitlistLen: 1,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });

    await useStore.getState().documentLock.actions.yieldDocumentLockOnLeave(
      collection,
      docID
    );

    expect(handOverDocumentLock).toHaveBeenCalledWith(collection, docID);
    expect(releaseDocumentLock).not.toHaveBeenCalled();
    expect(useStore.getState().documentLock.scopes[scopeKey]?.readOnly).toBe(true);
  });

  it("yieldDocumentLockOnLeave: viewer-depart when queued but not holder", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: false,
      waitingInHandoffQueue: true,
      readOnly: false,
    });
    postDocumentLockViewerDeparted.mockResolvedValue({ ok: true, status: 204 });

    await useStore.getState().documentLock.actions.yieldDocumentLockOnLeave(
      collection,
      docID
    );

    expect(postDocumentLockViewerDeparted).toHaveBeenCalledWith(collection, docID);
    expect(releaseDocumentLock).not.toHaveBeenCalled();
  });

  it("handOverEditAccess: runs when pendingAccessRequest even if lockHeld false (snackbar accept)", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: false,
      pendingAccessRequest: true,
      readOnly: false,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(handOverDocumentLock).toHaveBeenCalledWith(collection, docID);
    const s = useStore.getState().documentLock.scopes[scopeKey];
    expect(s?.readOnly).toBe(true);
    expect(s?.lockHeld).toBe(false);
    expect(s?.pendingAccessRequest).toBe(false);
  });

  it("handOverEditAccess: no-op when neither lockHeld nor pendingAccessRequest", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: false,
      pendingAccessRequest: false,
    });

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(handOverDocumentLock).not.toHaveBeenCalled();
  });

  it("handOverEditAccess: 204 released_no_queue patches neutral + warning", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
      pendingAccessRequest: true,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: true,
      status: 204,
      text: vi.fn().mockResolvedValue(""),
    });

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("no longer waiting"),
      5
    );
    const s = useStore.getState().documentLock.scopes[scopeKey];
    expect(s?.lockHeld).toBe(false);
    expect(s?.readOnly).toBe(false);
  });

  it("handOverEditAccess: 409 noop shows warning without former-holder read-only patch", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
      pendingAccessRequest: true,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({ error: "doc_lock_hand_over_noop" }),
      text: vi.fn().mockResolvedValue('{"error":"doc_lock_hand_over_noop"}'),
    });

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("Could not hand over"),
      6
    );
    const s = useStore.getState().documentLock.scopes[scopeKey];
    expect(s?.lockHeld).toBe(true);
    expect(s?.readOnly).toBe(false);
  });

  it("acceptAccessRequest: not-handled delegates to handOverEditAccess", async () => {
    vi.mocked(requestEditJobReleaseConfirmation).mockResolvedValue("not-handled");
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: true,
      status: 200,
      text: vi.fn().mockResolvedValue(""),
    });

    await useStore.getState().documentLock.actions.acceptAccessRequest(collection, docID);

    expect(handOverDocumentLock).toHaveBeenCalledWith(collection, docID);
  });

  it("acceptAccessRequest: proceed skips second hand-over", async () => {
    vi.mocked(requestEditJobReleaseConfirmation).mockResolvedValue("proceed");

    await useStore.getState().documentLock.actions.acceptAccessRequest(collection, docID);

    expect(handOverDocumentLock).not.toHaveBeenCalled();
  });

  it("acceptAccessRequest: cancelled clears pending notice", async () => {
    vi.mocked(requestEditJobReleaseConfirmation).mockResolvedValue("cancelled");
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      pendingAccessRequest: true,
    });

    await useStore.getState().documentLock.actions.acceptAccessRequest(collection, docID);

    expect(
      useStore.getState().documentLock.scopes[scopeKey]?.pendingAccessRequest
    ).toBe(false);
    expect(handOverDocumentLock).not.toHaveBeenCalled();
  });

  it("requestAccess: 201 auto-grant patches holder + success snackbar", async () => {
    requestDocumentLockAccess.mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        expiresAtUnix: 1_800_000_000,
        ttlSeconds: 120,
      }),
    });

    await useStore.getState().documentLock.actions.requestAccess(collection, docID);

    expect(suppressDocumentLockVacancyNotice).toHaveBeenCalled();
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Edit access granted.", 3);
    const s = useStore.getState().documentLock.scopes[scopeKey];
    expect(s?.lockHeld).toBe(true);
    expect(s?.readOnly).toBe(false);
  });

  it("requestAccess: 200 acquired+held patches holder + success snackbar", async () => {
    requestDocumentLockAccess.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        acquired: true,
        held: true,
        expiresAtUnix: 1_800_000_001,
        ttlSeconds: 121,
      }),
    });

    await useStore.getState().documentLock.actions.requestAccess(collection, docID);

    expect(suppressDocumentLockVacancyNotice).toHaveBeenCalled();
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Edit access granted.", 3);
    expect(useStore.getState().documentLock.scopes[scopeKey]?.lockHeld).toBe(true);
  });

  it("forceReleaseSameAccountEditLock: confirm false skips API", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);

    await useStore
      .getState()
      .documentLock.actions.forceReleaseSameAccountEditLock(collection, docID);

    expect(forceReleaseDocumentLockSameAccount).not.toHaveBeenCalled();
    expect(acquireDocumentLock).not.toHaveBeenCalled();
  });

  it("forceReleaseSameAccountEditLock: 404 shows no-lock snackbar", async () => {
    forceReleaseDocumentLockSameAccount.mockResolvedValue({ status: 404 });

    await useStore
      .getState()
      .documentLock.actions.forceReleaseSameAccountEditLock(collection, docID);

    expect(showSnackbarSuccess).toHaveBeenCalledWith("No active lock to remove.", 3);
    expect(acquireDocumentLock).not.toHaveBeenCalled();
  });

  it("forceReleaseSameAccountEditLock: 400 shows already-holder warning", async () => {
    forceReleaseDocumentLockSameAccount.mockResolvedValue({ status: 400 });

    await useStore
      .getState()
      .documentLock.actions.forceReleaseSameAccountEditLock(collection, docID);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("already hold this lock"),
      4
    );
  });

  it("forceReleaseSameAccountEditLock: network error on force-release is swallowed", async () => {
    forceReleaseDocumentLockSameAccount.mockRejectedValue(new Error("network"));

    await useStore
      .getState()
      .documentLock.actions.forceReleaseSameAccountEditLock(collection, docID);

    expect(showSnackbarSuccess).not.toHaveBeenCalled();
    expect(showSnackbarWarning).not.toHaveBeenCalled();
    expect(acquireDocumentLock).not.toHaveBeenCalled();
  });

  it("pulseWaitlist: no-op when not waitingInHandoffQueue", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      waitingInHandoffQueue: false,
    });

    await useStore.getState().documentLock.actions.pulseWaitlist(collection, docID);

    expect(pulseDocumentLockWaitlist).not.toHaveBeenCalled();
  });

  it("pulseWaitlist: calls API when waitingInHandoffQueue", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      waitingInHandoffQueue: true,
    });
    pulseDocumentLockWaitlist.mockResolvedValue(undefined);

    await useStore.getState().documentLock.actions.pulseWaitlist(collection, docID);

    expect(pulseDocumentLockWaitlist).toHaveBeenCalledWith(collection, docID);
  });

  it("claimHandoffProbe: 200 + held patches holder and shows success", async () => {
    claimDocumentLockHandoff.mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        held: true,
        expiresAtUnix: 1_900_000_000,
        ttlSeconds: 200,
      }),
    });

    await useStore.getState().documentLock.actions.claimHandoffProbe(collection, docID);

    expect(suppressDocumentLockVacancyNotice).toHaveBeenCalled();
    expect(showSnackbarSuccess).toHaveBeenCalledWith("Edit access granted.", 3);
    expect(useStore.getState().documentLock.scopes[scopeKey]?.lockHeld).toBe(true);
  });

  it("claimHandoffProbe: non-success does not patch holder", async () => {
    claimDocumentLockHandoff.mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({ held: false }),
    });

    await useStore.getState().documentLock.actions.claimHandoffProbe(collection, docID);

    expect(showSnackbarSuccess).not.toHaveBeenCalled();
    expect(useStore.getState().documentLock.scopes[scopeKey]).toBeUndefined();
  });

  it("claimHandoffProbe: network error is swallowed", async () => {
    claimDocumentLockHandoff.mockRejectedValue(new Error("offline"));

    await expect(
      useStore.getState().documentLock.actions.claimHandoffProbe(collection, docID)
    ).resolves.toBeUndefined();
  });

  it("handOverEditAccess: non-409 failure uses response body text", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: false,
      status: 418,
      text: vi.fn().mockResolvedValue("I'm a teapot"),
    });

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(showSnackbarWarning).toHaveBeenCalledWith("I'm a teapot", 5);
  });

  it("handOverEditAccess: non-409 failure falls back to status message", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
    });
    handOverDocumentLock.mockResolvedValue({
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue("   "),
    });

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("Hand over failed (503)"),
      5
    );
  });

  it("handOverEditAccess: rejected fetch shows network warning", async () => {
    useStore.getState().documentLock.actions.patchDocumentLockForScope(collection, docID, {
      lockHeld: true,
    });
    handOverDocumentLock.mockRejectedValue(new TypeError("aborted"));

    await useStore.getState().documentLock.actions.handOverEditAccess(collection, docID);

    expect(showSnackbarWarning).toHaveBeenCalledWith(
      expect.stringContaining("Hand over failed (network)"),
      5
    );
  });
});
