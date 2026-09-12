import { describe, expect, it } from "vitest";
import { archiveStoreState } from "./archiveHarness.jsx";

// The state an archive page is rendered against. Both of these went wrong once:
// a signed-out default left every page rendering its empty message with no
// request fired, and an override that names one action used to drop the rest.
describe("archiveStoreState", () => {
  it("is signed in, so the queries are enabled", () => {
    expect(archiveStoreState().account.isLoggedIn).toBe(true);
  });

  it("carries the actions a restore reaches for", () => {
    const { actions } = archiveStoreState().jobData;

    expect(actions.updateOrAddJobsToJobArray).toBeTypeOf("function");
    expect(actions.addGroupToGroupArray).toBeTypeOf("function");
    expect(actions.updateModifiedGroups).toBeTypeOf("function");
  });

  it("keeps the restore actions when an override names another", () => {
    const state = archiveStoreState({
      jobData: { actions: { findJobInJobArray: () => "found" } },
    });

    expect(state.jobData.actions.findJobInJobArray()).toBe("found");
    expect(state.jobData.actions.updateModifiedGroups).toBeTypeOf("function");
  });

  it("lets a caller sign the account out again", () => {
    const state = archiveStoreState({ account: { isLoggedIn: false } });

    expect(state.account.isLoggedIn).toBe(false);
  });
});
