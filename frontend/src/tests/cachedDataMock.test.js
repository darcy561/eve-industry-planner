import { describe, expect, it } from "vitest";
import * as real from "../Functions/Helper/getCachedData.js";
import { cachedDataMock } from "./cachedDataMock.js";

describe("cachedDataMock", () => {
  // The reason this exists. Compared against the real module rather than a
  // copied list, which would fall behind exactly as the mocks it replaces did.
  it("covers every export the real module has", () => {
    expect(Object.keys(cachedDataMock()).sort()).toEqual(
      Object.keys(real).sort(),
    );
  });

  it("answers as though nothing is cached", async () => {
    const mock = cachedDataMock();

    expect(await mock.getFullItemList()).toEqual({});
    expect(await mock.getSearchIndex()).toEqual([]);
    expect(await mock.getCachedData()).toBeNull();
  });

  it("takes an override by name", async () => {
    const mock = cachedDataMock({
      getFullItemList: async () => ({ 34: { name: "Tritanium" } }),
    });

    expect(await mock.getFullItemList()).toEqual({ 34: { name: "Tritanium" } });
    expect(await mock.getSearchIndex()).toEqual([]);
  });
});
