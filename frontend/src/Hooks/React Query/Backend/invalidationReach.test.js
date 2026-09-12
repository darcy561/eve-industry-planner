import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
const state = await (async () => {
  const { usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreState();
})();

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(state);
});
vi.mock("../../../global-config-app", () => ({
  default: { DEFAULT_ARCHIVE_REFRESH_PERIOD: 2 },
}));
vi.mock("../../../Functions/Endpoints/Private/statisticsTimeline.js", () => ({
  getAccountTimeline: vi.fn(),
  getAccountTimelineItems: vi.fn(),
}));
vi.mock("../../../Functions/Endpoints/Private/statisticsTotals.js", () => ({
  default: vi.fn(),
}));

const { timelineQueryKey, timelineItemsQueryKey } =
  await import("./statisticsTimeline.js");
const { invalidateArchiveQueries, archivedJobsQueryKey, archivedJobQueryKey } =
  await import("./archivedJobsList.js");
const { totalsQueryKey } = await import("./statisticsTotals.js");
const { plannerScopedQueryRoots } = await import("./plannerQueryScope.js");

// Archiving a job changes the archive and the figures derived from it together,
// so one call has to reach both. A key outside what it invalidates survives and
// shows what the write already replaced — a stale dashboard beside fresh totals,
// or a list missing the job just archived into it.
//
// Asserted against a real QueryClient rather than by comparing key shapes,
// because the shapes can match while the prefix still fails to match.
describe("archive invalidation", () => {
  it("reaches every statistics view and the archive list", async () => {
    const qc = new QueryClient();
    qc.setQueryData(timelineQueryKey(), { months: [] });
    qc.setQueryData(timelineItemsQueryKey(), { items: [] });
    qc.setQueryData(totalsQueryKey(34), { typeID: 34 });
    qc.setQueryData(archivedJobsQueryKey(), { jobs: [] });

    invalidateArchiveQueries(qc);

    for (const key of [
      timelineQueryKey(),
      timelineItemsQueryKey(),
      totalsQueryKey(34),
      archivedJobsQueryKey(),
    ]) {
      expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(
        true,
      );
    }
  });

  // A restore writes to one planner but moves figures a member of another may be
  // looking at, so invalidation stops above the owner and clears both.
  it("reaches a planner other than the one being worked in", async () => {
    const qc = new QueryClient();
    const own = archivedJobsQueryKey();
    const ownTotals = totalsQueryKey(34);

    state.activePlanner.owner = "corporation:98000001";
    const other = archivedJobsQueryKey();
    const otherTotals = totalsQueryKey(34);
    state.activePlanner.owner = null;

    expect(other).not.toEqual(own);
    for (const key of [own, other, ownTotals, otherTotals]) {
      qc.setQueryData(key, { rows: [] });
    }

    invalidateArchiveQueries(qc);

    for (const key of [own, other, ownTotals, otherTotals]) {
      expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(
        true,
      );
    }
  });
});

// Two planners' documents are different data under the same view, so a switch
// must not read an entry filled for the planner before it.
describe("planner-scoped query keys", () => {
  // A switch drops what was cached for the planner it leaves, and the roots it
  // removes have to cover every scoped view or one survives holding the previous
  // planner's rows.
  it("are all reachable from the roots a switch drops", () => {
    const qc = new QueryClient();
    qc.setQueryData(archivedJobsQueryKey(), { rows: [] });
    qc.setQueryData(timelineQueryKey(), { months: [] });
    qc.setQueryData(totalsQueryKey(34), { typeID: 34 });

    for (const root of plannerScopedQueryRoots()) {
      qc.removeQueries({ queryKey: root });
    }

    for (const key of [
      archivedJobsQueryKey(),
      timelineQueryKey(),
      totalsQueryKey(34),
    ]) {
      expect(qc.getQueryData(key), JSON.stringify(key)).toBeUndefined();
    }
  });

  // Only the planner being left is dropped: the one switched to keeps whatever
  // it had cached.
  it("leave another planner's entries alone", () => {
    const qc = new QueryClient();
    state.activePlanner.owner = "corporation:98000001";
    const other = archivedJobsQueryKey();
    qc.setQueryData(other, { rows: [] });

    state.activePlanner.owner = null;
    for (const root of plannerScopedQueryRoots()) {
      qc.removeQueries({ queryKey: root });
    }

    expect(qc.getQueryData(other)).toEqual({ rows: [] });
  });

  it("name the planner whose documents they hold", () => {
    expect(archivedJobsQueryKey()[2]).toBe(
      `account:${state.account.accountID}`,
    );

    state.activePlanner.owner = "corporation:98000001";
    expect(archivedJobsQueryKey()[2]).toBe("corporation:98000001");
    expect(archivedJobQueryKey("job-1")[2]).toBe("corporation:98000001");
    state.activePlanner.owner = null;
  });
});
