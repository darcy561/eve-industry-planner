import { describe, it, expect, vi, beforeEach } from "vitest";

const requestWithPrivateHeaders = vi.fn();

vi.mock("./applyPrivateHeaders.js", () => ({
  default: (...args) => requestWithPrivateHeaders(...args),
}));
// The path names the owner, so a request needs one.
vi.mock("../../../Zustand/usersStore", () => ({
  default: { getState: () => ({ account: { accountID: "acct-1" } }) },
}));

const { getAccountTimeline, getAccountTimelineItems, isCalendarMonth } =
  await import("./statisticsTimeline.js");

function jsonResponse(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

const timelineBody = {
  period: { from: "2026-07", to: "2026-08", defaulted: true },
  totals: { salesTotal: 100, profitLoss: 20 },
  months: [
    { year: 2026, month: 7, complete: true, salesTotal: 60 },
    { year: 2026, month: 8, complete: false, salesTotal: 40 },
  ],
};

function requestedURL() {
  return requestWithPrivateHeaders.mock.calls[0][0];
}

beforeEach(() => {
  requestWithPrivateHeaders.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getAccountTimeline", () => {
  // The dashboard's comparison is the bare endpoint: omitting the range is how a
  // caller asks for the current month and the one before it.
  it("sends no range when none is given", async () => {
    requestWithPrivateHeaders.mockResolvedValue(jsonResponse(timelineBody));

    const got = await getAccountTimeline();

    expect(requestedURL()).toBe("/api/v1/statistics/account:acct-1/timeline");
    expect(got.period.defaulted).toBe(true);
    expect(got.months).toHaveLength(2);
  });

  it("sends both bounds when a range is given", async () => {
    requestWithPrivateHeaders.mockResolvedValue(jsonResponse(timelineBody));

    await getAccountTimeline({ from: "2026-01", to: "2026-03", typeID: 34 });

    const url = requestedURL();
    expect(url).toContain("from=2026-01");
    expect(url).toContain("to=2026-03");
    expect(url).toContain("typeID=34");
  });

  // The API rejects half a range rather than filling in the missing bound, so
  // sending one would spend a request to be told what the caller already knows.
  it("refuses half a range without calling the API", async () => {
    expect(await getAccountTimeline({ from: "2026-01" })).toBeNull();
    expect(await getAccountTimeline({ to: "2026-03" })).toBeNull();
    expect(requestWithPrivateHeaders).not.toHaveBeenCalled();
  });

  it("refuses a month that is not YYYY-MM", async () => {
    for (const bad of ["2026-1", "26-01", "2026-13", "August", "2026-01-05"]) {
      expect(await getAccountTimeline({ from: bad, to: "2026-03" })).toBeNull();
    }
    expect(requestWithPrivateHeaders).not.toHaveBeenCalled();
  });

  it("returns null when the request fails", async () => {
    requestWithPrivateHeaders.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => "statistics_range_too_long",
    });

    expect(await getAccountTimeline({ from: "2000-01", to: "2026-08" })).toBeNull();
  });
});

describe("getAccountTimelineItems", () => {
  it("passes ranking and paging to the server", async () => {
    requestWithPrivateHeaders.mockResolvedValue(
      jsonResponse({ period: {}, paging: { totalItems: 0 }, items: [] })
    );

    await getAccountTimelineItems({ sort: "salesTotal", order: "asc", limit: 50, offset: 100 });

    const url = requestedURL();
    expect(url).toContain("sort=salesTotal");
    expect(url).toContain("order=asc");
    expect(url).toContain("limit=50");
    expect(url).toContain("offset=100");
  });

  // offset=0 is a real value, not an absent one: dropping it would silently page
  // from wherever the server defaults to.
  it("sends offset zero rather than omitting it", async () => {
    requestWithPrivateHeaders.mockResolvedValue(
      jsonResponse({ period: {}, paging: {}, items: [] })
    );

    await getAccountTimelineItems({ offset: 0 });

    expect(requestedURL()).toContain("offset=0");
  });

  it("applies the same range rules as the month view", async () => {
    expect(await getAccountTimelineItems({ from: "2026-01" })).toBeNull();
    expect(await getAccountTimelineItems({ from: "bad", to: "2026-03" })).toBeNull();
    expect(requestWithPrivateHeaders).not.toHaveBeenCalled();
  });
});

describe("isCalendarMonth", () => {
  it("accepts a zero-padded month and rejects anything else", () => {
    expect(isCalendarMonth("2026-01")).toBe(true);
    expect(isCalendarMonth("2026-12")).toBe(true);
    expect(isCalendarMonth("2026-1")).toBe(false);
    expect(isCalendarMonth("2026-00")).toBe(false);
    expect(isCalendarMonth("2026-13")).toBe(false);
    expect(isCalendarMonth(202601)).toBe(false);
    expect(isCalendarMonth(null)).toBe(false);
  });
});
