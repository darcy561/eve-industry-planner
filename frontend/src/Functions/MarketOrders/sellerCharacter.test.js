import { beforeEach, describe, expect, it, vi } from "vitest";

const storeState = {
  applicationSettings: { defaultMarketCharacter: null },
  account: {
    characters: [],
    actions: {
      getMainCharacter: () =>
        storeState.account.characters.find((c) => c.isMainCharacter) ?? null,
      findCharacterByHash: (hash) =>
        storeState.account.characters.find((c) => c.CharacterHash === hash) ??
        null,
    },
  },
};

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(storeState));
});

const { resolveSellerCharacter } = await import("./sellerCharacter");

const trader = {
  CharacterHash: "trader",
  CharacterName: "Market Alt",
  isMainCharacter: false,
};
const main = {
  CharacterHash: "main",
  CharacterName: "Main Pilot",
  isMainCharacter: true,
};

beforeEach(() => {
  storeState.account.characters = [main, trader];
  storeState.applicationSettings.defaultMarketCharacter = null;
});

describe("resolveSellerCharacter", () => {
  // The account names its seller in settings; nothing else is consulted first.
  it("takes the seller the account has chosen", () => {
    storeState.applicationSettings.defaultMarketCharacter = "trader";

    expect(resolveSellerCharacter()).toEqual({
      hash: "trader",
      name: "Market Alt",
      isDefault: false,
    });
  });

  it("stands in with the main until one is chosen", () => {
    storeState.applicationSettings.defaultMarketCharacter = null;

    expect(resolveSellerCharacter().isDefault).toBe(true);
  });

  // A character removed from the account cannot price anything, and quoting it
  // silently would be worse than saying the seller is a stand-in.
  it("falls back when the chosen seller has left the account", () => {
    storeState.applicationSettings.defaultMarketCharacter = "removed";

    expect(resolveSellerCharacter()).toEqual({
      hash: "main",
      name: "Main Pilot",
      isDefault: true,
    });
  });

  // The seller is a separate choice from the builder: market skills and the
  // standings grind usually sit on a trading alt, not on whoever runs the job.
  it("returns the chosen seller over the main", () => {
    expect(resolveSellerCharacter("trader")).toEqual({
      hash: "trader",
      name: "Market Alt",
      isDefault: false,
    });
  });

  it("stands in with the main until a seller is chosen", () => {
    expect(resolveSellerCharacter(null)).toEqual({
      hash: "main",
      name: "Main Pilot",
      isDefault: true,
    });
  });

  // A hash left behind by a character since removed from the account must not
  // quote that character's rates; it falls back and says it is a stand-in.
  it("falls back when the chosen seller is no longer on the account", () => {
    expect(resolveSellerCharacter("removed")).toEqual({
      hash: "main",
      name: "Main Pilot",
      isDefault: true,
    });
  });

  it("names nobody when signed out", () => {
    storeState.account.characters = [];

    expect(resolveSellerCharacter(null)).toEqual({
      hash: null,
      name: null,
      isDefault: true,
    });
  });
});
