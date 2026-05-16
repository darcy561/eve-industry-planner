import {
  acquireDocumentLock,
  claimDocumentLockHandoff,
  forceReleaseDocumentLockSameAccount,
  handOverDocumentLock,
  pulseDocumentLockWaitlist,
  requestDocumentLockAccess,
} from "../Functions/Endpoints/Pirivate/documentLockClient.js";
import { suppressDocumentLockVacancyNotice } from "../Functions/DocumentLock/documentLockAcquireFeedback.js";
import { showSnackbarSuccess, showSnackbarWarning } from "../Events/snackbarEvents.js";
import { requestEditJobReleaseConfirmation } from "../Events/editJobReleaseRequestEvents.js";
import {
  docLockScopeKey,
  initialScopedDocumentLockState,
} from "../Functions/DocumentLock/documentLockScope.js";
import { buildGrantedHolderPatch, numberOrNull } from "../Functions/DocumentLock/documentLockStatusFields.js";

/**
 * @typedef {import("../Functions/DocumentLock/documentLockScope.js").ScopedDocumentLockState} ScopedDocumentLockState
 */

/**
 * Clears handoff / waitlist UI fields on the scope (matches
 * `documentLockHookShared.clearedHandoffState` — inlined here to avoid a
 * `usersStore` ↔ slice import cycle).
 */
function clearedHandoffFieldsForSlice() {
  return {
    extendSegmentCount: null,
    waitlistLen: null,
    handoffPendingHolder: false,
    pendingHandoffOfferClientID: null,
    pendingHandoffExpiresAtUnix: null,
    handoffOfferForMe: false,
    waitingInHandoffQueue: false,
  };
}

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
       * Apply many `(collection, docID) → partial` patches inside a single
       * `set` call so the store fires exactly one subscriber notification
       * (and React 18 auto-batches the resulting re-renders into one
       * commit). Used by the batched group→jobs cascade event handler in
       * `useLockScopeSync.js` — replaces what used to be N independent
       * `patchPlannerJobLockScopeFromApi` follow-up fetches.
       *
       * Entries with missing `collection` / `docID` / `partial` are
       * silently skipped to keep the call-site simple.
       *
       * @param {ReadonlyArray<{
       *   collection: string,
       *   docID: string,
       *   partial: Partial<ScopedDocumentLockState>
       * }>} updates
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
              ...state,
              documentLock: {
                ...state.documentLock,
                scopes: nextScopes,
                actions: state.documentLock.actions,
              },
            };
          },
          false,
          "documentLock/patchManyScopes"
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

      /**
       * Same-account emergency: POST `/force-release` then acquire. Confirms in
       * the browser before calling the API.
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
            "An active session may lose unsaved work."
        );
        if (!ok) return;
        try {
          const res = await forceReleaseDocumentLockSameAccount(collection, docID);
          if (res.status === 204) {
            suppressDocumentLockVacancyNotice();
            patchDocumentLockForScope(collection, docID, {
              lockHeld: false,
              readOnly: false,
              pendingAccessRequest: false,
              lockExpiresAtUnix: null,
              lockTtlSeconds: null,
              ...clearedHandoffFieldsForSlice(),
            });
            const res2 = await acquireDocumentLock(collection, docID);
            const data = await res2.json().catch(() => ({}));
            if (res2.status === 201) {
              patchDocumentLockForScope(
                collection,
                docID,
                buildGrantedHolderPatch(data, { withClearedHandoff: true })
              );
              showSnackbarSuccess("Edit lock cleared — you now hold the lock.", 3);
              return;
            }
            // Same shape as POST /request auto-grant (defensive if API ever returns 200).
            if (
              res2.ok &&
              res2.status === 200 &&
              data.acquired === true &&
              data.held === true
            ) {
              suppressDocumentLockVacancyNotice();
              patchDocumentLockForScope(
                collection,
                docID,
                buildGrantedHolderPatch(data, { withClearedHandoff: true })
              );
              showSnackbarSuccess("Edit lock cleared — you now hold the lock.", 3);
              return;
            }
            // Another session (often the other tab on this account) won the race to POST /acquire.
            if (
              res2.ok &&
              res2.status === 200 &&
              data.held === true &&
              data.acquired === false
            ) {
              const viewerPatch = {
                readOnly: true,
                lockHeld: false,
                lockExpiresAtUnix: numberOrNull(data, "expiresAtUnix"),
                lockTtlSeconds: numberOrNull(data, "ttlSeconds"),
              };
              if (typeof data.viewerCount === "number") {
                viewerPatch.viewerCount = data.viewerCount;
              }
              patchDocumentLockForScope(collection, docID, {
                ...viewerPatch,
                ...clearedHandoffFieldsForSlice(),
              });
              showSnackbarWarning(
                "The lock was cleared, but another session took the edit lease first — this tab is read-only. Try Request access or clear again if stuck.",
                6
              );
              return; 
            }
            showSnackbarWarning(
              `The lock was cleared, but this tab could not take ownership (${res2.status}). Try the lock control in the header.`,
              5
            );
            return;
          }
          if (res.status === 404) {
            showSnackbarSuccess("No active lock to remove.", 3);
            return;
          }
          if (res.status === 400) {
            showSnackbarWarning(
              "You already hold this lock — leave read-only or use the editor's release flow.",
              4
            );
            return;
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
          pendingHandoffOfferClientID: null,
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
            patchDocumentLockForScope(collection, docID, readOnlyFormerHolderPatch);
            return;
          }
          if (res.ok && res.status === 204) {
            patchDocumentLockForScope(collection, docID, releasedNoQueuePatch);
            showSnackbarWarning(
              "The other session is no longer waiting — the edit lock was released.",
              5
            );
            return;
          }
          if (res.status === 409) {
            showSnackbarWarning(
              "Could not hand over from this tab (lock state changed). Refresh or try Request access on the other tab.",
              6
            );
            return;
          }
          const errText = (await res.text().catch(() => "")).trim();
          showSnackbarWarning(
            errText || `Hand over failed (${res.status}). Try again.`,
            5
          );
        } catch {
          showSnackbarWarning(
            "Hand over failed (network). Check your connection and try again.",
            5
          );
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
