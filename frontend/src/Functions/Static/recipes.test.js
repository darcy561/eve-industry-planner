import { describe, it, expect, vi, beforeEach } from "vitest";

const getRecipeListFromCache = vi.fn();

vi.mock("../Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../tests/archiveHarness.jsx");
  return cachedDataMock({
    getRecipeListFromCache: (...args) => getRecipeListFromCache(...args),
  });
});

const { primeRecipes, recipeFor, resetRecipes } = await import("./recipes.js");

const RIFTER = { itemID: 587, name: "Rifter", blueprintTypeID: 683 };
const HOBGOBLIN = { itemID: 2454, name: "Hobgoblin I", blueprintTypeID: 969 };

beforeEach(() => {
  vi.clearAllMocks();
  resetRecipes();
  getRecipeListFromCache.mockResolvedValue([RIFTER, HOBGOBLIN]);
});

describe("priming", () => {
  it("reads a recipe back once primed", async () => {
    await primeRecipes();
    expect(recipeFor(587)?.name).toBe("Rifter");
  });

  it("answers nothing before it has loaded", () => {
    expect(recipeFor(587)).toBeUndefined();
  });

  it("loads once for concurrent callers", async () => {
    await Promise.all([primeRecipes(), primeRecipes()]);
    expect(getRecipeListFromCache).toHaveBeenCalledTimes(1);
  });

  // A failure remembered as the answer would leave every later caller inheriting one outage.
  it("retries after a failure", async () => {
    getRecipeListFromCache.mockRejectedValueOnce(new Error("offline"));
    await expect(primeRecipes()).rejects.toThrow("offline");

    await primeRecipes();
    expect(recipeFor(587)?.name).toBe("Rifter");
  });

  // A file that arrived as something other than a list is an empty set, not a crash on the first
  // read of it.
  it("holds nothing when the file is not a list", async () => {
    getRecipeListFromCache.mockResolvedValue({ 587: RIFTER });
    await primeRecipes();

    expect(recipeFor(587)).toBeUndefined();
  });
});

describe("finding a recipe", () => {
  // The file's ids are numbers, but a caller may hold either: a material's type id is a number, an
  // id read back off a stored document is a string. Both find the recipe.
  it("finds a recipe by a numeric id", async () => {
    await primeRecipes();
    expect(recipeFor(2454)?.name).toBe("Hobgoblin I");
  });

  it("finds the same recipe by a string id", async () => {
    await primeRecipes();
    expect(recipeFor("2454")?.name).toBe("Hobgoblin I");
  });

  it("answers nothing for an item the file does not carry", async () => {
    await primeRecipes();
    expect(recipeFor(34)).toBeUndefined();
  });
});

describe("resetRecipes", () => {
  // A refresh can bring a new SDE build, and what was primed is the old one.
  it("makes the next prime read the file again", async () => {
    await primeRecipes();
    resetRecipes();
    await primeRecipes();

    expect(getRecipeListFromCache).toHaveBeenCalledTimes(2);
  });

  it("drops what the old file held", async () => {
    await primeRecipes();
    resetRecipes();
    getRecipeListFromCache.mockResolvedValue([RIFTER]);
    await primeRecipes();

    expect(recipeFor(587)?.name).toBe("Rifter");
    expect(recipeFor(2454)).toBeUndefined();
  });
});
