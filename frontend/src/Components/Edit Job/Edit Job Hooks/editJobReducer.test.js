import { describe, expect, it } from "vitest";

import { editJobReducer, EDIT_JOB_ACTION_TYPES } from "./editJobReducer";
import Job from "../../../Classes/job";

const record = (jobs) => ({
  type: EDIT_JOB_ACTION_TYPES.RECORD_SPECULATIVE_CHILD_JOBS,
  payload: jobs,
});

const forget = (typeIDs) => ({
  type: EDIT_JOB_ACTION_TYPES.FORGET_SPECULATIVE_CHILD_JOBS,
  payload: typeIDs,
});

// Rows priced to answer "what would building this take" before anything is
// committed to. The map is written from more than one place at once — the
// summary strip costs every row in bulk while a drawer opening costs its own —
// so what it does with a second write is the whole point of it.
describe("the rows that have been costed", () => {
  const jobA = { itemID: 34, jobID: "spec-34" };
  const jobB = { itemID: 35, jobID: "spec-35" };

  it("records a costed job against its material", () => {
    const next = editJobReducer({ speculativeChildJobs: {} }, record([jobA]));

    expect(next.speculativeChildJobs).toEqual({ 34: jobA });
  });

  it("keeps the rows costed before it", () => {
    const next = editJobReducer(
      { speculativeChildJobs: { 34: jobA } },
      record([jobB]),
    );

    expect(next.speculativeChildJobs).toEqual({ 34: jobA, 35: jobB });
  });

  // Two rows costed at once is the ordinary case, not an edge: opening a drawer
  // while the bulk costing is still resolving. Merging against the state it is
  // handed rather than against a map a caller built from what it had read is
  // what stops the slower of the two erasing the other's row.
  it("does not lose a row costed while another was in flight", () => {
    const started = { speculativeChildJobs: {} };

    // Both callers begin from the same empty map.
    const afterA = editJobReducer(started, record([jobA]));
    const afterB = editJobReducer(afterA, record([jobB]));

    expect(afterB.speculativeChildJobs).toEqual({ 34: jobA, 35: jobB });
  });

  it("records several at once", () => {
    const next = editJobReducer(
      { speculativeChildJobs: {} },
      record([jobA, jobB]),
    );

    expect(next.speculativeChildJobs).toEqual({ 34: jobA, 35: jobB });
  });

  // A costed job is a guess. Once the row has committed to it, or taken it back
  // out, the guess is no longer about anything: confirming would act on a job
  // that is gone, and the bulk costing would count the row as priced and never
  // quote it again.
  it("forgets a row once its job is no longer a guess", () => {
    const next = editJobReducer(
      { speculativeChildJobs: { 34: jobA, 35: jobB } },
      forget([34]),
    );

    expect(next.speculativeChildJobs).toEqual({ 35: jobB });
  });

  it("forgets several at once", () => {
    const next = editJobReducer(
      { speculativeChildJobs: { 34: jobA, 35: jobB } },
      forget([34, 35]),
    );

    expect(next.speculativeChildJobs).toEqual({});
  });

  it("survives forgetting a row it never costed", () => {
    const next = editJobReducer(
      { speculativeChildJobs: { 34: jobA } },
      forget([99]),
    );

    expect(next.speculativeChildJobs).toEqual({ 34: jobA });
  });

  // Costing a row is a question the player asked, not a change to the job.
  // Nothing here is persisted, and marking the job modified would offer a save
  // for a decision nobody has made.
  it("does not mark the job modified either way", () => {
    const costed = editJobReducer(
      { speculativeChildJobs: {}, jobModified: false },
      record([jobA]),
    );
    const forgotten = editJobReducer(
      { speculativeChildJobs: { 34: jobA }, jobModified: false },
      forget([34]),
    );

    expect(costed.jobModified).toBe(false);
    expect(forgotten.jobModified).toBe(false);
  });

  it("leaves the rest of the state alone", () => {
    const next = editJobReducer(
      { speculativeChildJobs: {}, temporaryChildJobs: { 35: jobB } },
      record([jobA]),
    );

    expect(next.temporaryChildJobs).toEqual({ 35: jobB });
  });
});

// The reader's choices about the job's own screens — which tab, which setup is
// open, which market this job is priced against — are kept on the job. A
// component must not write them into the job it was handed, so it says what
// changed and this works out the rest.
describe("the reader's layout choices for the job being edited", () => {
  const patch = (layoutPatch) => ({
    type: EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB_LAYOUT,
    payload: layoutPatch,
  });

  function editing(layout = {}) {
    return {
      jobModified: false,
      activeJob: new Job({
        jobID: "job-1",
        itemID: 587,
        jobType: 1,
        layout,
      }),
    };
  }

  it("records what changed", () => {
    const next = editJobReducer(editing(), patch({ esiJobTab: "orders" }));

    expect(next.activeJob.layout.esiJobTab).toBe("orders");
  });

  it("leaves the choices it was not told about", () => {
    const state = editing({ setupToEdit: "setup-1" });

    const next = editJobReducer(state, patch({ esiJobTab: "orders" }));

    expect(next.activeJob.layout.setupToEdit).toBe("setup-1");
  });

  it("takes a choice back off the job", () => {
    const state = editing({ localMarketDisplay: 60003760 });

    const next = editJobReducer(state, patch({ localMarketDisplay: null }));

    expect(next.activeJob.layout.localMarketDisplay).toBeNull();
  });

  // The job the component was handed must come out of this untouched: anything
  // still rendering from it is entitled to the value it read.
  it("does not write into the job it was given", () => {
    const state = editing({ esiJobTab: "jobs" });
    const before = state.activeJob;

    const next = editJobReducer(state, patch({ esiJobTab: "orders" }));

    expect(before.layout.esiJobTab).toBe("jobs");
    expect(next.activeJob).not.toBe(before);
  });

  it("hands back a job, not a plain object", () => {
    const next = editJobReducer(editing(), patch({ esiJobTab: "orders" }));

    expect(next.activeJob).toBeInstanceOf(Job);
  });

  it("marks the job as having unsaved changes", () => {
    const next = editJobReducer(editing(), patch({ esiJobTab: "orders" }));

    expect(next.jobModified).toBe(true);
  });

  it("does nothing when no job is open", () => {
    const state = { jobModified: false, activeJob: null };

    expect(editJobReducer(state, patch({ esiJobTab: "orders" }))).toBe(state);
  });
});

// The job's own market and basis are a decision, so they land under `build`
// rather than beside the screen state above.
describe("the job's own pricing choice", () => {
  const patch = (pricingPatch) => ({
    type: EDIT_JOB_ACTION_TYPES.UPDATE_ACTIVE_JOB_PRICING,
    payload: pricingPatch,
  });

  const editing = (build = {}) => ({
    jobModified: false,
    activeJob: new Job({ jobID: "job-1", itemID: 587, jobType: 1, build }),
  });

  const hek = { buying: { market: "hek", basis: "buy" }, selling: {} };

  it("records the market and basis the reader chose", () => {
    const next = editJobReducer(editing(), patch({ localPricing: hek }));

    expect(next.activeJob.build.localPricing.buying).toMatchObject({
      market: "hek",
      basis: "buy",
    });
  });

  it("leaves the rest of the build alone", () => {
    const state = editing({
      materialPriceOverrides: { 34: { orderDisplay: "buy" } },
    });

    const next = editJobReducer(state, patch({ localPricing: hek }));

    expect(next.activeJob.build.materialPriceOverrides).toEqual({
      34: { orderDisplay: "buy" },
    });
  });

  it("takes the choice back off the job", () => {
    const state = editing({ localPricing: hek });

    const next = editJobReducer(state, patch({ localPricing: null }));

    expect(next.activeJob.build.localPricing).toBeNull();
  });

  it("does not write into the job it was given", () => {
    const state = editing();
    const before = state.activeJob;

    const next = editJobReducer(state, patch({ localPricing: hek }));

    expect(before.build.localPricing).toBeNull();
    expect(next.activeJob).not.toBe(before);
  });

  it("marks the job as having unsaved changes", () => {
    const next = editJobReducer(editing(), patch({ localPricing: hek }));

    expect(next.jobModified).toBe(true);
  });

  it("does nothing when no job is open", () => {
    const state = { jobModified: false, activeJob: null };

    expect(editJobReducer(state, patch({ localPricing: hek }))).toBe(state);
  });
});

describe("marking a grouped job ready for sale", () => {
  const toggle = () => ({
    type: EDIT_JOB_ACTION_TYPES.TOGGLE_ACTIVE_JOB_READY_FOR_SALE,
  });

  function building(isReadyToSell, jobStatus) {
    return {
      jobModified: false,
      activeJob: new Job({
        jobID: "job-1",
        itemID: 587,
        jobType: 1,
        jobStatus,
        isReadyToSell,
      }),
    };
  }

  it("moves the job on a step when it was not ready", () => {
    const next = editJobReducer(building(false, 3), toggle());

    expect(next.activeJob.jobStatus).toBe(4);
    expect(next.activeJob.isReadyToSell).toBe(true);
  });

  it("leaves the step alone when it was already ready", () => {
    const next = editJobReducer(building(true, 4), toggle());

    expect(next.activeJob.jobStatus).toBe(4);
    expect(next.activeJob.isReadyToSell).toBe(false);
  });

  it("does not write into the job it was given", () => {
    const state = building(false, 3);
    const before = state.activeJob;

    editJobReducer(state, toggle());

    expect(before.jobStatus).toBe(3);
    expect(before.isReadyToSell).toBe(false);
  });

  it("does nothing when no job is open", () => {
    const state = { jobModified: false, activeJob: null };

    expect(editJobReducer(state, toggle())).toBe(state);
  });
});

// A sale entered by hand, for stock sold outside anything ESI reported.
describe("recording a sale the reader entered", () => {
  const add = (transaction) => ({
    type: EDIT_JOB_ACTION_TYPES.ADD_CUSTOM_TRANSACTION,
    payload: transaction,
  });

  const sale = {
    transaction_id: "custom-1",
    type_id: 587,
    quantity: 5,
    unit_price: 100,
    date: "2026-01-01T00:00:00Z",
  };

  function selling(transactions = []) {
    return {
      jobModified: false,
      activeJob: new Job({
        jobID: "job-1",
        itemID: 587,
        jobType: 1,
        build: { sale: { transactions } },
      }),
    };
  }

  it("puts the sale on the job", () => {
    const next = editJobReducer(selling(), add(sale));

    expect(Object.keys(next.activeJob.esi.transactions)).toHaveLength(1);
    expect(next.activeJob.esi.transactions["custom-1"].transaction_id).toBe(
      "custom-1",
    );
  });

  it("keeps the sales already recorded", () => {
    const state = selling([{ transaction_id: "esi-1", type_id: 587 }]);

    const next = editJobReducer(state, add(sale));

    expect(
      Object.values(next.activeJob.esi.transactions).map(
        (t) => t.transaction_id,
      ),
    ).toEqual(["esi-1", "custom-1"]);
  });

  // A sale entered by hand belongs to no market order, and must not be given
  // one — that is the difference between it and a sale ESI reported.
  it("leaves it belonging to no market order", () => {
    const next = editJobReducer(selling(), add(sale));

    expect(
      next.activeJob.esi.transactions["custom-1"].order_id ?? null,
    ).toBeNull();
  });

  it("does not write into the job it was given", () => {
    const state = selling();
    const before = state.activeJob;

    editJobReducer(state, add(sale));

    expect(Object.keys(before.esi.transactions)).toHaveLength(0);
  });

  it("marks the job as having unsaved changes", () => {
    expect(editJobReducer(selling(), add(sale)).jobModified).toBe(true);
  });

  it("does nothing without a sale to record", () => {
    const state = selling();

    expect(editJobReducer(state, add(null))).toBe(state);
  });
});
