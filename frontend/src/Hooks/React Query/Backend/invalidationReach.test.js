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
const { invalidateStatisticsQueries } = await import("./statisticsKeys.js");
const { totalsQueryKey } = await import("./statisticsTotals.js");

// The three views are produced by one rebuild, so an archive must invalidate all
// of them. A key that sits outside the shared root survives and shows figures the
// rebuild has already replaced — a stale dashboard beside fresh totals, which
// reads as a backend fault rather than a cache that was not cleared.
//
// Asserted against a real QueryClient rather than by comparing key shapes,
// because the shapes can match while the prefix still fails to match.
describe("statistics invalidation", () => {
  it("reaches every statistics view after an archive", async () => {
    const qc = new QueryClient();
    qc.setQueryData(timelineQueryKey(), { months: [] });
    qc.setQueryData(timelineItemsQueryKey(), { items: [] });
    qc.setQueryData(totalsQueryKey(34), { typeID: 34 });

    invalidateStatisticsQueries(qc);

    for (const key of [timelineQueryKey(), timelineItemsQueryKey(), totalsQueryKey(34)]) {
      expect(qc.getQueryState(key)?.isInvalidated, JSON.stringify(key)).toBe(true);
    }
  });
});
