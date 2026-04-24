import {
  claimDocumentLockHandoff,
  pulseDocumentLockWaitlist,
  releaseDocumentLock,
  requestDocumentLockAccess,
} from "../Functions/Endpoints/Pirivate/documentLockClient.js";
import { suppressDocumentLockVacancyNotice } from "../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { showSnackbarSuccess } from "../Events/snackbarEvents.js";
import {
  docLockScopeKey,
  initialScopedDocumentLockState,
} from "../Functions/DocumentLock/documentLockScope.js";

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
            patchDocumentLockForScope(collection, docID, {
              lockHeld: true,
              readOnly: false,
              waitingInHandoffQueue: false,
              lockExpiresAtUnix:
                typeof data.expiresAtUnix === "number"
                  ? data.expiresAtUnix
                  : null,
              lockTtlSeconds:
                typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
            });
            showSnackbarSuccess("Edit access granted.", 3);
            return;
          }
          if (res.status === 200 && data.acquired === true && data.held === true) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(collection, docID, {
              lockHeld: true,
              readOnly: false,
              waitingInHandoffQueue: false,
              lockExpiresAtUnix:
                typeof data.expiresAtUnix === "number"
                  ? data.expiresAtUnix
                  : null,
              lockTtlSeconds:
                typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
            });
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

      /** Release the lock and become read-only so another session can acquire (after they requested access). */
      handOverEditAccess: async (collection, docID) => {
        const dl =
          get().documentLock.scopes[docLockScopeKey(collection, docID)] ??
          initialScopedDocumentLockState();
        if (!dl.lockHeld || !collection || !docID) return;
        try {
          await releaseDocumentLock(collection, docID);
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
            patchDocumentLockForScope(collection, docID, {
              lockHeld: true,
              readOnly: false,
              handoffOfferForMe: false,
              handoffPendingHolder: false,
              pendingHandoffOfferClientID: null,
              pendingHandoffExpiresAtUnix: null,
              waitingInHandoffQueue: false,
              extendSegmentCount: 0,
              lockExpiresAtUnix:
                typeof data.expiresAtUnix === "number"
                  ? data.expiresAtUnix
                  : null,
              lockTtlSeconds:
                typeof data.ttlSeconds === "number" ? data.ttlSeconds : null,
            });
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
