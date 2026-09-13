import { describe, expect, it } from "vitest";
import * as real from "../Functions/Helper/getCachedData.js";
import { cachedDataMock } from "./cachedDataMock.js";

describe("cachedDataMock", () => {
  // The reason this exists. Compared against the real module rather than a
  // copied list, which would fall behind exactly as the mocks it replaces did.
  //
  // It matches names only. A stub carrying the right name and the wrong shape
  // passes this and fails its caller, which is how `refreshStaticDataCache`
  // came to answer with nothing after the real one started returning an object.
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

  // The names matching is not enough on its own: a stub can carry the right
  // name and the wrong shape. This one is destructured by its caller, so
  // answering with nothing throws inside that hook's try/catch and the test it
  // was supporting goes quietly uncovered rather than red.
  it("answers refreshStaticDataCache with something destructurable", async () => {
    const { changed } = await cachedDataMock().refreshStaticDataCache();

    expect(changed).toBe(false);
  });

  it("takes an override by name", async () => {
    const mock = cachedDataMock({
      getFullItemList: async () => ({ 34: { name: "Tritanium" } }),
    });

    expect(await mock.getFullItemList()).toEqual({ 34: { name: "Tritanium" } });
    expect(await mock.getSearchIndex()).toEqual([]);
  });
});
