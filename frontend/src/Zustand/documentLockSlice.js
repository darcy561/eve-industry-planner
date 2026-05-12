import {
  claimDocumentLockHandoff,
  handOverDocumentLock,
  pulseDocumentLockWaitlist,
  requestDocumentLockAccess,
} from "../Functions/Endpoints/Pirivate/documentLockClient.js";
import { suppressDocumentLockVacancyNotice } from "../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { showSnackbarSuccess } from "../Events/snackbarEvents.js";
import { requestEditJobReleaseConfirmation } from "../Events/editJobReleaseRequestEvents.js";
import {
  docLockScopeKey,
  initialScopedDocumentLockState,
} from "../Functions/DocumentLock/documentLockScope.js";
import { buildGrantedHolderPatch } from "../Functions/DocumentLock/documentLockStatusFields.js";

/**
 * @typedef {import("../Functions/DocumentLock/documentLockScope.js").ScopedDocumentLockState} ScopedDocumentLockState
 */

const documentLockSlice = (set, get) => ({
  documentLock: {
    /** @type {Record<string, ScopedDocumentLockState>} */
    scopes: {},

    actions: {
      /** Remove all in-memory lock UI (e.g. sign-out). */
      resetAllDocumentLocks: () =>
        set(
          (state) => ({
            ...state,
            documentLock: {
              ...state.documentLock,
              scopes: {},
              actions: state.documentLock.actions,
            },
          }),
          false,
          "documentLock/resetAll"
        ),

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
              ...state,
              documentLock: {
                ...state.documentLock,
                scopes: {
                  ...state.documentLock.scopes,
                  [k]: { ...prev, ...partial },
                },
                actions: state.documentLock.actions,
              },
            };
          },
          false,
          "documentLock/patchScope"
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
              ...state,
              documentLock: {
                ...state.documentLock,
                scopes: rest,
                actions: state.documentLock.actions,
              },
            };
          },
          false,
          "documentLock/resetScope"
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
              buildGrantedHolderPatch(data)
            );
            showSnackbarSuccess("Edit access granted.", 3);
            return;
          }
          if (res.status === 200 && data.acquired === true && data.held === true) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(
              collection,
              docID,
              buildGrantedHolderPatch(data)
            );
            showSnackbarSuccess("Edit access granted.", 3);
            return;
          }
          if (res.status === 202) {
            patchDocumentLockForScope(collection, docID, {
              waitingInHandoffQueue: true,
            });
          }
        } catch {
          /* ignore */
        }
      },

      pulseWaitlist: async (collection, docID) => {
        if (!collection || !docID) return;
        const dl = get().documentLock.scopes[docLockScopeKey(collection, docID)];
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

      /** @param {string} collection @param {string} docID */
      clearPendingAccessNotice: (collection, docID) =>
        set(
          (state) => {
            const k = docLockScopeKey(collection, docID);
            const prev =
              state.documentLock.scopes[k] ?? initialScopedDocumentLockState();
            return {
              ...state,
              documentLock: {
                ...state.documentLock,
                scopes: {
                  ...state.documentLock.scopes,
                  [k]: { ...prev, pendingAccessRequest: false },
                },
                actions: state.documentLock.actions,
              },
            };
          },
          false,
          "documentLock/clearPending"
        ),

      /**
       * Snackbar "accept" entry point. When the holder is on the edit-job page
       * with unsaved changes we route through the unsaved-changes dialog (via
       * {@link requestEditJobReleaseConfirmation}); save / discard both end up
       * calling {@link handOverEditAccess} themselves and resolve `proceed`
       * here, cancel resolves `cancelled` (we dismiss the notice, requester
       * stays queued for the next natural rotation). Pages without an edit
       * handler registered fall through to a direct hand-over so groups still
       * transfer cleanly.
       *
       * @param {string} collection
       * @param {string} docID
       */
      acceptAccessRequest: async (collection, docID) => {
        if (!collection || !docID) return;
        const outcome = await requestEditJobReleaseConfirmation({
          collection,
          docID,
        });
        if (outcome === "cancelled") {
          get().documentLock.actions.clearPendingAccessNotice(
            collection,
            docID
          );
          return;
        }
        if (outcome === "proceed") {
          // Dialog handler already called handOverEditAccess (so the lock
          // transfer can race the route unmount safely) — nothing left to do.
          return;
        }
        // "not-handled" → no edit-page handler registered (group page, etc) or
        // the holder has no unsaved changes; just complete the hand-over.
        await get().documentLock.actions.handOverEditAccess(collection, docID);
      },

      /**
       * Holder accepts an access request: hand ownership directly to the alive
       * waitlist head via `/hand-over` (atomic on the server). Avoids the
       * neutral-lock window that a plain `/release` would leave behind, so the
       * requester actually receives the lock instead of racing for it.
       */
      handOverEditAccess: async (collection, docID) => {
        const dl =
          get().documentLock.scopes[docLockScopeKey(collection, docID)] ??
          initialScopedDocumentLockState();
        if (!dl.lockHeld || !collection || !docID) return;
        try {
          await handOverDocumentLock(collection, docID);
          const k = docLockScopeKey(collection, docID);
          set(
            (state) => {
              const prev =
                state.documentLock.scopes[k] ?? initialScopedDocumentLockState();
              return {
                ...state,
                documentLock: {
                  ...state.documentLock,
                  scopes: {
                    ...state.documentLock.scopes,
                    [k]: {
                      ...prev,
                      readOnly: true,
                      lockHeld: false,
                      pendingAccessRequest: false,
                      lockExpiresAtUnix: null,
                      lockTtlSeconds: null,
                      extendSegmentCount: null,
                      waitlistLen: null,
                      handoffPendingHolder: false,
                      pendingHandoffOfferClientID: null,
                      pendingHandoffExpiresAtUnix: null,
                      handoffOfferForMe: false,
                      waitingInHandoffQueue: false,
                    },
                  },
                  actions: state.documentLock.actions,
                },
              };
            },
            false,
            "documentLock/handOver"
          );
        } catch {
          /* ignore */
        }
      },

      /** Called automatically when WS probes this session — confirms presence and takes the lock. */
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
              buildGrantedHolderPatch(data, { withClearedHandoff: true })
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
