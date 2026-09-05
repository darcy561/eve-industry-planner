import { describe, it, expect, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("../../../Zustand/usersStore", () => ({
  default: Object.assign((s) => s({ account: { isLoggedIn: true } }), {
    getState: () => ({ account: { isLoggedIn: true } }),
  }),
}));
vi.mock("../../../global-config-app", () => ({
  default: { DEFAULT_ARCHIVE_REFRESH_PERIOD: 2 },
}));
vi.mock("../../../Functions/Endpoints/Private/statisticsTimeline.js", () => ({
  getAccountTimeline: vi.fn(), getAccountTimelineItems: vi.fn(),
}));
vi.mock("../../../Functions/Endpoints/Private/statisticsTotals.js", () => ({ default: vi.fn() }));

const { timelineQueryKey, timelineItemsQueryKey } = await import("./statisticsTimeline.js");
const { invalidateArchiveQueries, archivedJobsQueryKey } = await import("./archivedJobsList.js");
const { totalsQueryKey } = await import("./statisticsTotals.js");

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
      expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });
});
