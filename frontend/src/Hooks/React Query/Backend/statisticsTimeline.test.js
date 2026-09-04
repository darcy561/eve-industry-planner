import { describe, it, expect, vi } from "vitest";

const account = { isLoggedIn: true, accountID: "acct-1" };

vi.mock("../../../Zustand/usersStore", () => ({
  default: Object.assign((selector) => selector({ account }), {
    getState: () => ({ account }),
  }),
}));

vi.mock("../../../global-config-app", () => ({
  default: { DEFAULT_ARCHIVE_REFRESH_PERIOD: 2 },
}));

vi.mock("../../../Functions/Endpoints/Private/statisticsTimeline.js", () => ({
  getAccountTimeline: vi.fn(),
  getAccountTimelineItems: vi.fn(),
}));

const {
  timelineQueryKey,
  timelineItemsQueryKey,
  timelineQueryOptions,
  timelineItemsQueryOptions,
} = await import("./statisticsTimeline.js");

const { STATISTICS_QUERY_KEY_ROOT } = await import("./statisticsKeys.js");

describe("timeline query keys", () => {
  // Invalidation targets ["backend", STATISTICS_QUERY_KEY_ROOT]. A key outside
  // that prefix survives an archive and shows figures the rebuild has replaced.
  it("sit under the shared statistics root so invalidation reaches them", () => {
    for (const key of [timelineQueryKey(), timelineItemsQueryKey()]) {
      expect(key[0]).toBe("backend");
      expect(key[1]).toBe(STATISTICS_QUERY_KEY_ROOT);
    }
  });

  it("separate the two views", () => {
    expect(timelineQueryKey()[3]).not.toBe(timelineItemsQueryKey()[3]);
  });

  // Two planners' figures are different data under the same view, so the owner
  // is part of the key. Without it the first shared planner reads an entry
  // filled for another owner.
  it("name whose figures they hold", () => {
    for (const key of [timelineQueryKey(), timelineItemsQueryKey()]) {
      expect(key[2]).toBe("account:acct-1");
    }
  });

  // The server chooses the window when the caller does not, so "the default" and
  // an explicit range are different responses and must not share an entry.
  it("distinguish a defaulted window from an explicit one", () => {
    const bare = JSON.stringify(timelineQueryKey());
    const ranged = JSON.stringify(timelineQueryKey({ from: "2026-01", to: "2026-03" }));
    expect(bare).not.toBe(ranged);
  });

  it("distinguish an item filter from the whole account", () => {
    const all = JSON.stringify(timelineQueryKey());
    const one = JSON.stringify(timelineQueryKey({ typeID: 34 }));
    expect(all).not.toBe(one);
    // A numeric and string type id are the same request.
    expect(JSON.stringify(timelineQueryKey({ typeID: 34 }))).toBe(
      JSON.stringify(timelineQueryKey({ typeID: "34" }))
    );
  });

  // Ranking and paging happen on the server, so a different sort or page is a
  // different response rather than a re-slice of one already cached.
  it("distinguish sort, order and page for the item breakdown", () => {
    const base = JSON.stringify(timelineItemsQueryKey());
    const sorted = JSON.stringify(timelineItemsQueryKey({ sort: "salesTotal" }));
    const ascending = JSON.stringify(timelineItemsQueryKey({ order: "asc" }));
    const paged = JSON.stringify(timelineItemsQueryKey({ offset: 25 }));

    expect(new Set([base, sorted, ascending, paged]).size).toBe(4);
  });

  it("treat the same options as the same key", () => {
    expect(JSON.stringify(timelineQueryKey({ from: "2026-01", to: "2026-03" }))).toBe(
      JSON.stringify(timelineQueryKey({ from: "2026-01", to: "2026-03" }))
    );
  });
});

describe("timeline query options", () => {
  // All three views come from one rebuild, so refetching one sooner than another
  // would show a month that disagrees with the totals beside it.
  it("share a stale time derived from the archive refresh period", () => {
    const expected = 2 * 60 * 60 * 1000;
    expect(timelineQueryOptions().staleTime).toBe(expected);
    expect(timelineItemsQueryOptions().staleTime).toBe(expected);
  });

  // Paging replaces the whole response, so without this the table blanks between
  // pages rather than holding the previous one.
  it("keep the previous page visible while the next loads", () => {
    const { placeholderData } = timelineItemsQueryOptions();
    expect(typeof placeholderData).toBe("function");
    expect(placeholderData({ items: [1] })).toEqual({ items: [1] });
  });
});
