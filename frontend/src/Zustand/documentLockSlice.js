import {
  claimDocumentLockHandoff,
  forceReleaseDocumentLockSameAccount,
  handOverDocumentLock,
  postDocumentLockViewerDeparted,
  pulseDocumentLockWaitlist,
  releaseDocumentLock,
  requestDocumentLockAccess,
} from "../Functions/Endpoints/Private/documentLockClient.js";
import { suppressDocumentLockVacancyNotice } from "../Functions/DocumentLock/documentLockAcquireFeedback.js";
import {
  showSnackbarSuccess,
  showSnackbarWarning,
} from "../Events/snackbarEvents.js";
import { requestEditJobReleaseConfirmation } from "../Events/editJobReleaseRequestEvents.js";
import {
  docLockScopeKey,
  initialScopedDocumentLockState,
} from "../Functions/DocumentLock/documentLockScope.js";
import { buildGrantedHolderPatch } from "../Functions/DocumentLock/documentLockStatusFields.js";

/**
 * @typedef {import("../Functions/DocumentLock/documentLockScope.js").ScopedDocumentLockState} ScopedDocumentLockState
 */

/** The handoff and waitlist fields of a lock scope, cleared. */
function clearedHandoffFieldsForSlice() {
  return {
    extendSegmentCount: null,
    waitlistLen: null,
    handoffPendingHolder: false,
    pendingHandoffOfferParticipantID: null,
    pendingHandoffExpiresAtUnix: null,
    handoffOfferForMe: false,
    waitingInHandoffQueue: false,
  };
}

const documentLockSlice = (set, get) => ({
  documentLock: {
    /**
     * @type {Record<string, ScopedDocumentLockState>}
     */
    scopes: {},

    actions: {
      /** Removes all in-memory lock state, as on sign-out. */
      resetAllDocumentLocks: () =>
        set(
          (state) => ({
            documentLock: {
              ...state.documentLock,
              scopes: {},
            },
          }),
          false,
          "documentLock/resetAll",
        ),

      /**
       * Applies many lock-scope patches in one store update, so subscribers are told once.
       *
       * @param {ReadonlyArray<{
       *     collection: string,
       *     docID: string,
       *     partial: Partial<ScopedDocumentLockState>
       *   }>} updates
       */
      patchManyDocumentLockScopes: (updates) => {
        if (!Array.isArray(updates) || updates.length === 0) return;
        set(
          (state) => {
            const nextScopes = { ...state.documentLock.scopes };
            let changed = false;
            for (const u of updates) {
              if (!u || !u.collection || !u.docID || !u.partial) continue;
              const k = docLockScopeKey(u.collection, u.docID);
              const prev = nextScopes[k] ?? initialScopedDocumentLockState();
              nextScopes[k] = { ...prev, ...u.partial };
              changed = true;
            }
            if (!changed) return state;
            return {
              documentLock: {
                ...state.documentLock,
                scopes: nextScopes,
              },
            };
          },
          false,
          "documentLock/patchManyScopes",
        );
      },

      /**
       * @param {string} collection
       * @param {string} docID
       * @param {Partial<ScopedDocumentLockState>} partial
       */
      patchDocumentLockForScope: (collection, docID, partial) => {
        if (!collection || !docID) return;
        const k = docLockScopeKey(collection, docID);
        set(
          (state) => {
            const prev =
              state.documentLock.scopes[k] ?? initialScopedDocumentLockState();
            return {
              documentLock: {
                ...state.documentLock,
                scopes: {
                  ...state.documentLock.scopes,
                  [k]: { ...prev, ...partial },
                },
              },
            };
          },
          false,
          "documentLock/patchScope",
        );
      },

      /**
       * @param {string} collection
       * @param {string} docID
       */
      resetDocumentLockForScope: (collection, docID) => {
        if (!collection || !docID) return;
        const k = docLockScopeKey(collection, docID);
        set(
          (state) => {
            if (!state.documentLock.scopes[k]) return state;
            const { [k]: _removed, ...rest } = state.documentLock.scopes;
            return {
              documentLock: {
                ...state.documentLock,
                scopes: rest,
              },
            };
          },
          false,
          "documentLock/resetScope",
        );
      },

      requestAccess: async (collection, docID) => {
        if (!collection || !docID) return;
        const { patchDocumentLockForScope } = get().documentLock.actions;
        try {
          const res = await requestDocumentLockAccess(collection, docID);
          const data = await res.json().catch(() => ({}));
          if (res.status === 201) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(
              collection,
              docID,
              buildGrantedHolderPatch(data),
            );
            showSnackbarSuccess("Edit access granted.", 3);
            return;
          }
          if (
            res.status === 200 &&
            data.acquired === true &&
            data.held === true
          ) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(
              collection,
              docID,
              buildGrantedHolderPatch(data),
            );
            showSnackbarSuccess("Edit access granted.", 3);
            return;
          }
          if (res.status === 202) {
            patchDocumentLockForScope(collection, docID, {
              waitingInHandoffQueue: true,
              readOnly: true,
            });
          }
        } catch {
          /* ignore */
        }
      },

      /**
       * Same-account emergency: POST `/force-release` atomically evicts the other session and
       * grants the lock to this tab.
       *
       * @param {string} collection
       * @param {string} docID
       */
      forceReleaseSameAccountEditLock: async (collection, docID) => {
        if (!collection || !docID) return;
        const { patchDocumentLockForScope } = get().documentLock.actions;
        const ok = window.confirm(
          "Remove the edit lock from the other tab on this account? " +
            "Only use if you are stuck (e.g. crashed editor). " +
            "An active session may lose unsaved work.",
        );
        if (!ok) return;
        try {
          const res = await forceReleaseDocumentLockSameAccount(
            collection,
            docID,
          );
          let data = {};
          if (typeof res.json === "function") {
            data = await res.json().catch(() => ({}));
          }
          if (res.status === 201) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(
              collection,
              docID,
              buildGrantedHolderPatch(data, { withClearedHandoff: true }),
            );
            showSnackbarSuccess(
              "Edit lock cleared — you now hold the lock.",
              3,
            );
            return;
          }
          if (res.status === 404) {
            showSnackbarSuccess("No active lock to remove.", 3);
            return;
          }
          if (res.status === 409) {
            showSnackbarWarning(
              "Someone else is editing this. Ask them for access instead — a lock you do not hold cannot be cleared.",
              6,
            );
            return;
          }
          if (res.status === 400) {
            showSnackbarWarning(
              "You already hold this lock — leave read-only or use the editor's release flow.",
              4,
            );
            return;
          }
          showSnackbarWarning("The lock could not be cleared.", 5);
        } catch {
          showSnackbarWarning("The lock could not be cleared.", 5);
        }
      },

      pulseWaitlist: async (collection, docID) => {
        if (!collection || !docID) return;
        const dl =
          get().documentLock.scopes[docLockScopeKey(collection, docID)];
        const waiting =
          dl?.waitingInHandoffQueue ??
          initialScopedDocumentLockState().waitingInHandoffQueue;
        if (!waiting) return;
        try {
          await pulseDocumentLockWaitlist(collection, docID);
        } catch {
          /* ignore */
        }
      },

      /**
       * @param {string} collection @param {string} docID
       */
      clearPendingAccessNotice: (collection, docID) =>
        set(
          (state) => {
            const k = docLockScopeKey(collection, docID);
            const prev =
              state.documentLock.scopes[k] ?? initialScopedDocumentLockState();
            return {
              documentLock: {
                ...state.documentLock,
                scopes: {
                  ...state.documentLock.scopes,
                  [k]: { ...prev, pendingAccessRequest: false },
                },
              },
            };
          },
          false,
          "documentLock/clearPending",
        ),

      /**
       * Snackbar "accept" entry point.
       *
       * @param {string} collection
       * @param {string} docID
       */
      acceptAccessRequest: async (collection, docID) => {
        if (!collection || !docID) return;
        const outcome = await requestEditJobReleaseConfirmation({
          collection: collection,
          docID: docID,
        });
        if (outcome === "cancelled") {
          get().documentLock.actions.clearPendingAccessNotice(
            collection,
            docID,
          );
          return;
        }
        if (outcome === "proceed") {
          return;
        }
        await get().documentLock.actions.handOverEditAccess(collection, docID);
      },

      /**
       * Leave a document (close job, navigate away): hand over when someone is waiting, otherwise
       * `/release`; passive viewers send `/viewer-departed`.
       *
       * @param {string} collection
       * @param {string} docID
       */
      yieldDocumentLockOnLeave: async (collection, docID) => {
        if (!collection || !docID) return;
        const k = docLockScopeKey(collection, docID);
        const dl =
          get().documentLock.scopes[k] ?? initialScopedDocumentLockState();
        const { patchDocumentLockForScope } = get().documentLock.actions;
        const releasedNeutralPatch = {
          lockHeld: false,
          readOnly: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          suppressVacancyAcquire: true,
          ...clearedHandoffFieldsForSlice(),
        };
        const formerHolderReadOnlyPatch = {
          readOnly: true,
          lockHeld: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          extendSegmentCount: null,
          waitlistLen: null,
          handoffPendingHolder: false,
          pendingHandoffOfferParticipantID: null,
          pendingHandoffExpiresAtUnix: null,
          handoffOfferForMe: false,
          waitingInHandoffQueue: false,
        };

        const isHolder =
          dl.lockHeld === true || dl.pendingAccessRequest === true;
        if (isHolder) {
          const shouldHandOver =
            dl.pendingAccessRequest === true ||
            (typeof dl.waitlistLen === "number" && dl.waitlistLen > 0);
          try {
            patchDocumentLockForScope(collection, docID, {
              suppressVacancyAcquire: true,
            });
            if (shouldHandOver) {
              const res = await handOverDocumentLock(collection, docID);
              if (res.ok && res.status === 200) {
                patchDocumentLockForScope(
                  collection,
                  docID,
                  formerHolderReadOnlyPatch,
                );
                return;
              }
              if (res.ok && res.status === 204) {
                patchDocumentLockForScope(
                  collection,
                  docID,
                  releasedNeutralPatch,
                );
                return;
              }
            }
            const rel = await releaseDocumentLock(collection, docID);
            if (rel.ok) {
              patchDocumentLockForScope(
                collection,
                docID,
                releasedNeutralPatch,
              );
            }
          } catch {
            /* ignore */
          }
          return;
        }

        if (dl.readOnly || dl.waitingInHandoffQueue) {
          try {
            await postDocumentLockViewerDeparted(collection, docID);
          } catch {
            /* ignore */
          }
        }
      },

      /**
       * Holder accepts an access request: hand ownership directly to the alive waitlist head via
       * `/hand-over` (atomic on the server).
       */
      handOverEditAccess: async (collection, docID) => {
        const dl =
          get().documentLock.scopes[docLockScopeKey(collection, docID)] ??
          initialScopedDocumentLockState();
        const mayHandOver =
          (dl.lockHeld === true || dl.pendingAccessRequest === true) &&
          collection &&
          docID;
        if (!mayHandOver) return;

        const { patchDocumentLockForScope } = get().documentLock.actions;
        const readOnlyFormerHolderPatch = {
          readOnly: true,
          lockHeld: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          extendSegmentCount: null,
          waitlistLen: null,
          handoffPendingHolder: false,
          pendingHandoffOfferParticipantID: null,
          pendingHandoffExpiresAtUnix: null,
          handoffOfferForMe: false,
          waitingInHandoffQueue: false,
        };
        const releasedNoQueuePatch = {
          lockHeld: false,
          readOnly: false,
          pendingAccessRequest: false,
          lockExpiresAtUnix: null,
          lockTtlSeconds: null,
          ...clearedHandoffFieldsForSlice(),
        };

        try {
          const res = await handOverDocumentLock(collection, docID);
          if (res.ok && res.status === 200) {
            patchDocumentLockForScope(
              collection,
              docID,
              readOnlyFormerHolderPatch,
            );
            return;
          }
          if (res.ok && res.status === 204) {
            patchDocumentLockForScope(collection, docID, releasedNoQueuePatch);
            showSnackbarWarning(
              "The other session is no longer waiting — the edit lock was released.",
              5,
            );
            return;
          }
          if (res.status === 409) {
            showSnackbarWarning(
              "Could not hand over from this tab (lock state changed). Refresh or try Request access on the other tab.",
              6,
            );
            return;
          }
          const errText = (await res.text().catch(() => "")).trim();
          showSnackbarWarning(
            errText || `Hand over failed (${res.status}). Try again.`,
            5,
          );
        } catch {
          showSnackbarWarning(
            "Hand over failed (network). Check your connection and try again.",
            5,
          );
        }
      },

      /**
       * Called automatically when WS probes this session — confirms presence and takes the lock.
       */
      claimHandoffProbe: async (collection, docID) => {
        if (!collection || !docID) return;
        const { patchDocumentLockForScope } = get().documentLock.actions;
        try {
          const res = await claimDocumentLockHandoff(collection, docID);
          const data = await res.json().catch(() => ({}));
          if (res.ok && res.status === 200 && data.held === true) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(
              collection,
              docID,
              buildGrantedHolderPatch(data, { withClearedHandoff: true }),
            );
            showSnackbarSuccess("Edit access granted.", 3);
          }
        } catch {
          /* ignore */
        }
      },
    },
  },
});

export default documentLockSlice;
