/**
 * What the reader has asked to link or unlink when the job closes.
 *
 * These are not draft entries. Adding a child job also creates a job and writes
 * that job's own parents, so the intent cannot be inverted from a patch on this
 * document — it is held as a set of intents and carried out at close time.
 *
 * @param {Function} set
 * @returns {Object}
 */
export const linkingActions = (set) => {
  const update = (label, change) =>
    set(
      (state) => ({
        editSession: { ...state.editSession, ...change(state.editSession) },
      }),
      false,
      label,
    );

  const intoSet = (held, added) => [...new Set([...(held || []), ...added])];
  const without = (held, dropped) =>
    (held || []).filter((id) => !dropped.includes(id));
  const asList = (value) => (Array.isArray(value) ? value : [value]);

  const markParents = (label, into, outOf) => (parentJobID) =>
    update(label, (session) => ({
      parentChildToEdit: {
        ...session.parentChildToEdit,
        parentJobs: {
          ...session.parentChildToEdit.parentJobs,
          [into]: intoSet(session.parentChildToEdit.parentJobs[into], [
            parentJobID,
          ]),
          [outOf]: without(session.parentChildToEdit.parentJobs[outOf], [
            parentJobID,
          ]),
        },
      },
    }));

  const moved = (held, rows, { into, outOf }) => ({
    ...held,
    [into]: intoSet(held[into], asList(rows)),
    [outOf]: without(held[outOf], asList(rows)),
  });

  const markESI = (label, kind, into, outOf) => (rows) =>
    update(label, (session) => ({
      esiDataToLink: {
        ...session.esiDataToLink,
        [kind]: moved(session.esiDataToLink[kind], rows, { into, outOf }),
      },
    }));

  // A child link moves between the two lists rather than being appended to
  // both, so asking for a job and then cancelling leaves nothing behind.
  const markChildren = (label, into, outOf, keepTemporary) => (jobs) =>
    update(label, (session) => {
      const childJobs = { ...session.parentChildToEdit.childJobs };
      const temporaryChildJobs = { ...session.temporaryChildJobs };

      for (const job of asList(jobs)) {
        const held = childJobs[job.itemID] ?? { add: [], remove: [] };
        childJobs[job.itemID] = {
          ...held,
          [into]: intoSet(held[into], [job.jobID]),
          [outOf]: without(held[outOf], [job.jobID]),
        };
        if (keepTemporary) temporaryChildJobs[job.itemID] = job;
        else delete temporaryChildJobs[job.itemID];
      }

      return {
        temporaryChildJobs,
        parentChildToEdit: { ...session.parentChildToEdit, childJobs },
      };
    });

  return {
    /** @param {string} parentJobID */
    markParentJobForAddition: markParents(
      "markParentJobForAddition",
      "add",
      "remove",
    ),
    /** @param {string} parentJobID */
    markParentJobForRemoval: markParents(
      "markParentJobForRemoval",
      "remove",
      "add",
    ),
    /** @param {object|Array<object>} jobs */
    markChildJobsForAddition: markChildren(
      "markChildJobsForAddition",
      "add",
      "remove",
      true,
    ),
    /** @param {object|Array<object>} jobs */
    markChildJobsForRemoval: markChildren(
      "markChildJobsForRemoval",
      "remove",
      "add",
      false,
    ),
    /** @param {number|Array<number>} jobIDs */
    addIndustryESIJobsForAddition: markESI(
      "addIndustryESIJobsForAddition",
      "industryJobs",
      "add",
      "remove",
    ),
    /** @param {number|Array<number>} jobIDs */
    addIndustryESIJobsForRemoval: markESI(
      "addIndustryESIJobsForRemoval",
      "industryJobs",
      "remove",
      "add",
    ),
    /** @param {number|Array<number>} orderIDs */
    addMarketOrdersForAddition: markESI(
      "addMarketOrdersForAddition",
      "marketOrders",
      "add",
      "remove",
    ),
    /**
     * @param {number|Array<number>} orderIDs
     * @param {number|Array<number>} [transactionIDs] - Sales that came from those orders
     */
    addMarketOrdersForRemoval: (orderIDs, transactionIDs) =>
      update("addMarketOrdersForRemoval", (session) => ({
        esiDataToLink: {
          ...session.esiDataToLink,
          marketOrders: moved(session.esiDataToLink.marketOrders, orderIDs, {
            into: "remove",
            outOf: "add",
          }),
          ...(transactionIDs === undefined
            ? {}
            : {
                transactions: moved(
                  session.esiDataToLink.transactions,
                  transactionIDs,
                  { into: "remove", outOf: "add" },
                ),
              }),
        },
      })),

    /** @param {number|Array<number>} transactionIDs */
    addTransactionsForAddition: markESI(
      "addTransactionsForAddition",
      "transactions",
      "add",
      "remove",
    ),
    /** @param {number|Array<number>} transactionIDs */
    addTransactionsForRemoval: markESI(
      "addTransactionsForRemoval",
      "transactions",
      "remove",
      "add",
    ),

    /** @param {Object} temporaryChildJobs */
    setTemporaryChildJobs: (temporaryChildJobs) =>
      update("setTemporaryChildJobs", () => ({ temporaryChildJobs })),

    // Merged and deleted rather than replaced, because rows are costed
    // concurrently: a caller writing back a map it read before another finished
    // would lose the row costed in between.
    /** @param {Array<object>} jobs */
    recordSpeculativeChildJobs: (jobs) =>
      update("recordSpeculativeChildJobs", (session) => {
        const costed = { ...session.speculativeChildJobs };
        for (const job of jobs) costed[job.itemID] = job;
        return { speculativeChildJobs: costed };
      }),

    /** @param {Array<number>} typeIDs */
    forgetSpeculativeChildJobs: (typeIDs) =>
      update("forgetSpeculativeChildJobs", (session) => {
        const costed = { ...session.speculativeChildJobs };
        for (const typeID of typeIDs) delete costed[typeID];
        return { speculativeChildJobs: costed };
      }),
  };
};
