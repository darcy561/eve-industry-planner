/**
 * Which page owns the app bar document-lock control. Pages call
 * {@link ../Hooks/useRegisterHeaderDocumentLockUI.js} set this; {@link ../Components/Header/Header.jsx}
 * renders {@link ../Components/DocumentLock/DocumentLockHeaderControl.jsx} from here.
 *
 * Imperative API: {@link ../Events/headerDocumentLockEvents.js}
 */

/** @typedef {{ collection: string|null, docID: string|null, enabled?: boolean, readOnlyMessage?: string|null, label?: string|null, treeOwnership?: 'full'|'limited' }} HeaderDocumentLockRegistration */

function normalizeRegistrations(payload) {
  if (payload.registrations && Array.isArray(payload.registrations)) {
    return payload.registrations.map((r) => ({
      collection: r.collection ?? null,
      docID: r.docID ?? null,
      enabled: r.enabled !== false,
      readOnlyMessage: r.readOnlyMessage ?? null,
      label: r.label ?? null,
      treeOwnership: r.treeOwnership === "limited" ? "limited" : "full",
    }));
  }
  if (payload.collection && payload.docID) {
    return [
      {
        collection: payload.collection,
        docID: payload.docID,
        enabled: payload.enabled !== false,
        readOnlyMessage: payload.readOnlyMessage ?? null,
        label: payload.label ?? null,
        treeOwnership: payload.treeOwnership === "limited" ? "limited" : "full",
      },
    ];
  }
  return [];
}

/** @param {HeaderDocumentLockRegistration[]} a @param {HeaderDocumentLockRegistration[]} b */
function registrationsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i];
    const y = b[i];
    if (
      x.collection !== y.collection ||
      x.docID !== y.docID ||
      x.enabled !== y.enabled ||
      x.readOnlyMessage !== y.readOnlyMessage ||
      x.label !== y.label ||
      x.treeOwnership !== y.treeOwnership
    ) {
      return false;
    }
  }
  return true;
}

const initialHeaderDocumentLockUIState = () => ({
  /** @type {HeaderDocumentLockRegistration[]} */
  registrations: [],
});

const headerDocumentLockUISlice = (set) => ({
  headerDocumentLockUI: {
    ...initialHeaderDocumentLockUIState(),
    actions: {
      /** @param {Record<string, unknown>} [payload] */
      registerHeaderDocumentLockUI: (payload = {}) =>
        set(
          (state) => {
            const cur = state.headerDocumentLockUI;
            const nextRegs = normalizeRegistrations(payload);
            if (registrationsEqual(cur.registrations, nextRegs)) {
              return state;
            }
            return {
              ...state,
              headerDocumentLockUI: {
                ...cur,
                registrations: nextRegs,
                actions: cur.actions,
              },
            };
          },
          false,
          "headerDocumentLockUI/register"
        ),

      patchHeaderDocumentLockUI: (partial = {}) =>
        set(
          (state) => ({
            ...state,
            headerDocumentLockUI: {
              ...state.headerDocumentLockUI,
              ...partial,
              actions: state.headerDocumentLockUI.actions,
            },
          }),
          false,
          "headerDocumentLockUI/patch"
        ),

      clearHeaderDocumentLockUI: () =>
        set(
          (state) => ({
            ...state,
            headerDocumentLockUI: {
              ...state.headerDocumentLockUI,
              ...initialHeaderDocumentLockUIState(),
              actions: state.headerDocumentLockUI.actions,
            },
          }),
          false,
          "headerDocumentLockUI/clear"
        ),
    },
  },
});

export default headerDocumentLockUISlice;
