/**
 * Monotonic cursors for WebSocket `ChangeStreamMessage` applies (`_meta.lastModified` per logical doc).
 * Keys: `users.<accountId>`, `application_settings.<accountId>`, etc.
 */

/**
 * Mongo / Go JSON may send dates as RFC3339 strings or BSON extended JSON
 * (`{ "$date": ... }`). `new Date(object)` is invalid — that would drop every
 * realtime apply (cursor never advances).
 *
 * @param {unknown} value
 * @returns {number|null} epoch ms
 */
function lastModifiedToEpochMs(value) {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value === "object") {
    const o = /** @type {Record<string, unknown>} */ (value);
    if ("$date" in o) return lastModifiedToEpochMs(o.$date);
    if ("$numberLong" in o) {
      const n = Number(o.$numberLong);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

/** @param {unknown} doc */
export function metaLastModifiedMs(doc) {
  if (!doc || typeof doc !== "object") return null;
  const meta = /** @type {Record<string, unknown>} */ (doc)._meta;
  if (!meta || typeof meta !== "object") return null;
  const lm = /** @type {Record<string, unknown>} */ (meta).lastModified;
  const t = lastModifiedToEpochMs(lm);
  return t;
}

const realtimeSyncSlice = (set, get) => ({
  realtimeSync: {
    /** @type {Record<string, number>} docKey -> last applied server lastModified (ms) */
    cursors: {},
    actions: {
      /** @returns {number} */
      getCursorMs: (docKey) => get().realtimeSync.cursors[docKey] ?? 0,

      /**
       * @param {string} docKey
       * @param {number} ms
       */
      setCursorMs: (docKey, ms) => {
        if (!docKey || !Number.isFinite(ms)) return;
        set(
          (state) => ({
            ...state,
            realtimeSync: {
              ...state.realtimeSync,
              cursors: {
                ...state.realtimeSync.cursors,
                [docKey]: ms,
              },
              actions: state.realtimeSync.actions,
            },
          }),
          false,
          "realtimeSync/setCursorMs"
        );
      },

      reset: () =>
        set(
          (state) => ({
            ...state,
            realtimeSync: {
              cursors: {},
              actions: state.realtimeSync.actions,
            },
          }),
          false,
          "realtimeSync/reset"
        ),
    },
  },
});

export default realtimeSyncSlice;
