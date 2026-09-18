/**
 * How far each document has been applied, as the delivery's position in the
 * stream. Keys: `users.<accountId>`, `job_documents.<jobId>`, etc.
 *
 * The position belongs to the delivery rather than to the document, so a delete
 * carries one as readily as an upsert and a redelivery carries the same one
 * twice. A stamp taken from a document's own `lastModified` could do neither: a
 * delete has no stamp of its own, which is what drove the delete paths to the
 * browser's clock and left one comparison deciding between two clocks.
 */

const websocketSyncSlice = (set, get) => ({
  websocketSync: {
    /** @type {Record<string, number>} docKey -> last applied stream position */
    positions: {},
    actions: {
      /**
       * @param {string} docKey
       * @returns {number} 0 when nothing has been applied for that document
       */
      getPosition: (docKey) => get().websocketSync.positions[docKey] ?? 0,

      /**
       * @param {string} docKey
       * @param {number} position
       */
      setPosition: (docKey, position) => {
        if (!docKey || !Number.isFinite(position)) return;
        set(
          (state) => ({
            websocketSync: {
              ...state.websocketSync,
              positions: {
                ...state.websocketSync.positions,
                [docKey]: position,
              },
            },
          }),
          false,
          "websocketSync/setPosition",
        );
      },

      /**
       * One store update for many documents — a bulk delete flushed from the
       * coalescer would otherwise nest dozens of React updates (max ≈ 50).
       *
       * @param {Array<[string, number]>} entries - `[docKey, position]` pairs
       */
      setPositionBatch: (entries) => {
        if (!entries?.length) return;
        const patch = {};
        for (const pair of entries) {
          const docKey = pair?.[0];
          const position = pair?.[1];
          if (docKey && Number.isFinite(position)) patch[docKey] = position;
        }
        if (Object.keys(patch).length === 0) return;
        set(
          (state) => ({
            websocketSync: {
              ...state.websocketSync,
              positions: { ...state.websocketSync.positions, ...patch },
            },
          }),
          false,
          "websocketSync/setPositionBatch",
        );
      },

      /**
       * The furthest this client has applied, which is what a resume is answered
       * from: the server compares it with what was published while the socket
       * was down.
       *
       * @returns {number} 0 when nothing has been applied
       */
      getHighestPosition: () => {
        let highest = 0;
        for (const position of Object.values(get().websocketSync.positions)) {
          if (position > highest) highest = position;
        }
        return highest;
      },

      /**
       * Forgets what has been applied for a set of documents.
       *
       * A load replaces the store from a snapshot the stream knows nothing
       * about, so the positions it held no longer describe what is there. Left
       * standing, the first change to arrive after a load could carry a position
       * below one of them and be discarded.
       *
       * @param {string} prefix - a collection key, e.g. `job_documents`
       */
      forgetCollection: (prefix) => {
        if (!prefix) return;
        const held = get().websocketSync.positions;
        const kept = {};
        for (const [docKey, position] of Object.entries(held)) {
          if (!docKey.startsWith(`${prefix}.`)) kept[docKey] = position;
        }
        set(
          (state) => ({
            websocketSync: {
              ...state.websocketSync,
              positions: kept,
            },
          }),
          false,
          "websocketSync/forgetCollection",
        );
      },

      reset: () =>
        set(
          (state) => ({
            websocketSync: {
              positions: {},
              actions: state.websocketSync.actions,
            },
          }),
          false,
          "websocketSync/reset",
        ),
    },
  },
});

export default websocketSyncSlice;
