import { describe, it, expect, vi, beforeEach } from "vitest";

const requestWithPrivateHeaders = vi.fn();

vi.mock("./applyPrivateHeaders.js", () => ({
  default: (...args) => requestWithPrivateHeaders(...args),
}));

const { default: getAccountTotalsByTypeID } = await import("./statisticsTotals.js");

function jsonResponse(body) {
  return { ok: true, status: 200, statusText: "OK", json: async () => body };
}

const sampleRow = {
  jobType: 1,
  typeID: 34,
  totalJobs: 3,
  salesTotal: 5000,
  profitLoss: 1200,
  history: { buildCount: 3, lastCostPerItem: 250 },
};

beforeEach(() => {
  requestWithPrivateHeaders.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getAccountTotalsByTypeID", () => {
  // The endpoint answers with { typeID, items: [...] } because the same route
  // serves the whole-account read. Callers here expect the single row, so the
  // unwrapping happens at this boundary rather than in every panel.
  it("unwraps the single row from the items list", async () => {
    requestWithPrivateHeaders.mockResolvedValue(
      jsonResponse({ typeID: 34, items: [sampleRow] })
    );

    const got = await getAccountTotalsByTypeID(34);

    expect(got).toEqual(sampleRow);
    expect(got.history.buildCount).toBe(3);
  });

  it("requests the totals route with the type as a query parameter", async () => {
    requestWithPrivateHeaders.mockResolvedValue(
      jsonResponse({ typeID: 34, items: [sampleRow] })
    );

    await getAccountTotalsByTypeID(34);

    const [url] = requestWithPrivateHeaders.mock.calls[0];
    expect(url).toBe("/api/v1/statistics/account/totals?typeID=34");
  });

  // An account that has never built a type gets an empty list, not a placeholder
  // row: absent and zero are different answers and only a caller knows which its
  // view should show. Callers here have always been handed a zeroed row, so the
  // shape stays the same rather than becoming a null every panel must guard.
  it("returns a zeroed aggregate when the account has never built the type", async () => {
    requestWithPrivateHeaders.mockResolvedValue(
      jsonResponse({ typeID: 99, items: [] })
    );

    const got = await getAccountTotalsByTypeID(99);

    expect(got).not.toBeNull();
    expect(got.typeID).toBe(99);
    expect(got.totalJobs).toBe(0);
    expect(got.profitLoss).toBe(0);
    // Panels branch on `history.buildCount`, so the placeholder carries it rather
    // than leaving them to guard an undefined.
    expect(got.history).toEqual({ buildCount: 0 });
    expect(got.breakdown).toEqual({});
  });

  it("returns null when the request fails", async () => {
    requestWithPrivateHeaders.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      text: async () => "boom",
    });

    expect(await getAccountTotalsByTypeID(34)).toBeNull();
  });

  it("rejects a type id that is not a positive integer without calling the API", async () => {
    for (const bad of [null, "", "abc", "-1", "1.5"]) {
      expect(await getAccountTotalsByTypeID(bad)).toBeNull();
    }
    expect(requestWithPrivateHeaders).not.toHaveBeenCalled();
  });
});
