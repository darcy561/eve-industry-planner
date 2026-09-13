import { describe, it, expect, vi, beforeEach } from "vitest";

const getRecipeListFromCache = vi.fn();
const fetchBlueprints = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/archiveHarness.jsx");
  return cachedDataMock({
    getRecipeListFromCache: (...args) => getRecipeListFromCache(...args),
  });
});

vi.mock("../Endpoints/Public/blueprints", () => ({
  default: (...args) => fetchBlueprints(...args),
}));

const { resetRecipes } = await import("../Static/recipes.js");
const { default: getItemRecipes } = await import("./getItemRecipes.js");

const RIFTER = { itemID: 587, name: "Rifter" };
const HOBGOBLIN = { itemID: 2454, name: "Hobgoblin I" };

beforeEach(() => {
  vi.clearAllMocks();
  resetRecipes();
  getRecipeListFromCache.mockResolvedValue([RIFTER, HOBGOBLIN]);
  fetchBlueprints.mockResolvedValue([]);
});

describe("answering from the cached file", () => {
  it("answers a single item without asking the API", async () => {
    const recipes = await getItemRecipes(587);

    expect(recipes).toEqual([RIFTER]);
    expect(fetchBlueprints).not.toHaveBeenCalled();
  });

  it("answers several items at once", async () => {
    const recipes = await getItemRecipes([587, 2454]);

    expect(recipes.map((r) => r.name)).toEqual(["Rifter", "Hobgoblin I"]);
    expect(fetchBlueprints).not.toHaveBeenCalled();
  });

  // Building a job is repeated, so the file is read once rather than per build.
  it("reads the file once across two builds", async () => {
    await getItemRecipes([587]);
    await getItemRecipes([2454]);

    expect(getRecipeListFromCache).toHaveBeenCalledTimes(1);
  });

  // An id held as a string used to miss every recipe and send the whole build to the network.
  it("answers an id held as a string", async () => {
    const recipes = await getItemRecipes(["587"]);

    expect(recipes).toEqual([RIFTER]);
    expect(fetchBlueprints).not.toHaveBeenCalled();
  });
});

describe("falling back to the API", () => {
  // A recipe the file does not carry is one published since the build the app holds.
  it("asks the API when an item is missing", async () => {
    fetchBlueprints.mockResolvedValue([{ itemID: 99, name: "New Thing" }]);

    const recipes = await getItemRecipes([99]);

    expect(fetchBlueprints).toHaveBeenCalledWith([99]);
    expect(recipes.map((r) => r.name)).toEqual(["New Thing"]);
  });

  // The whole set is asked for rather than the found recipes being mixed with fetched ones, so
  // every recipe in one build request comes from one source.
  it("asks for the whole set when only some are missing", async () => {
    fetchBlueprints.mockResolvedValue([RIFTER, { itemID: 99 }]);

    await getItemRecipes([587, 99]);

    expect(fetchBlueprints).toHaveBeenCalledWith([587, 99]);
  });

  it("asks the API when the file cannot be read", async () => {
    getRecipeListFromCache.mockRejectedValue(new Error("offline"));
    fetchBlueprints.mockResolvedValue([RIFTER]);

    const recipes = await getItemRecipes([587]);

    expect(fetchBlueprints).toHaveBeenCalledWith([587]);
    expect(recipes).toEqual([RIFTER]);
  });
});
