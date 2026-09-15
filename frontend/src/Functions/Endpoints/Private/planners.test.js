import { describe, expect, it, vi, beforeEach } from "vitest";

const requests = [];
let nextResponse = null;

vi.mock("./applyPrivateHeaders.js", () => ({
  requestWithPrivateHeaders: async (url, options, config) => {
    requests.push({ url, options, config });
    return nextResponse;
  },
}));

const { fetchPlannerSettingsFromApi, savePlannerSettingsToApi } =
  await import("./planners.js");

const ok = (body) => ({
  ok: true,
  json: async () => body,
});
const failed = (status, text) => ({
  ok: false,
  status,
  statusText: "Bad Request",
  text: async () => text,
});

beforeEach(() => {
  requests.length = 0;
  nextResponse = null;
});

describe("reading and writing a planner's settings", () => {
  it("names the planner in the path, escaping the id and not the separator", async () => {
    nextResponse = ok({ owner: "corporation:a/b", seeded: true, settings: {} });

    await fetchPlannerSettingsFromApi("corporation:a/b c");

    expect(requests[0].url).toContain(
      "/api/v1/planners/corporation:a%2Fb%20c/settings",
    );
  });

  it("puts the update in the body of a PUT", async () => {
    nextResponse = ok({ owner: "account:acct-1", seeded: true, settings: {} });
    const update = { extrasCategories: [{ id: "0", label: "Unassigned" }] };

    await savePlannerSettingsToApi("account:acct-1", update);

    const { options, url } = requests[0];
    expect(url).toContain("/api/v1/planners/account:acct-1/settings");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body)).toEqual(update);
  });

  // A refused write has to reach the caller: the list it holds is not what the
  // planner now stores, and a resolved promise would say it was.
  it("throws when the server refuses the write", async () => {
    nextResponse = failed(400, 'extras categories: id "0" appears twice');

    await expect(
      savePlannerSettingsToApi("account:acct-1", { extrasCategories: [] }),
    ).rejects.toThrow("appears twice");
  });

  it("throws when the read fails", async () => {
    nextResponse = failed(503, "unavailable");

    await expect(fetchPlannerSettingsFromApi("account:acct-1")).rejects.toThrow(
      "503",
    );
  });

  it("refuses to build a request with no planner to name", async () => {
    await expect(savePlannerSettingsToApi("", {})).rejects.toThrow(
      "owner handle is required",
    );
    await expect(fetchPlannerSettingsFromApi("")).rejects.toThrow(
      "owner handle is required",
    );
    expect(requests).toEqual([]);
  });
});
