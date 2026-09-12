import { beforeEach, describe, expect, it, vi } from "vitest";

const { account } = vi.hoisted(() => ({ account: { actions: {} } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

import blueprintHolderLabel from "./blueprintHolderLabel";
import { OWNER_KIND } from "../Shared/ownerKind";

const characterBlueprint = {
  ownerType: OWNER_KIND.CHARACTER,
  ownerId: "hash-a",
};
const corporationBlueprint = {
  ownerType: OWNER_KIND.CORPORATION,
  ownerId: 98000001,
};

beforeEach(() => {
  account.actions = {
    findCharacterByHash: (hash) =>
      hash === "hash-a" ? { CharacterName: "Aura" } : undefined,
    getCorporation: (id) =>
      Number(id) === 98000001 ? { corporationName: "A Corp" } : undefined,
  };
});

describe("what the library calls a blueprint's holder", () => {
  it("names the character holding it, and where", () => {
    expect(blueprintHolderLabel(characterBlueprint, "Jita IV-4")).toBe(
      "Aura — Jita IV-4",
    );
  });

  it("names the corporation holding it", () => {
    expect(blueprintHolderLabel(corporationBlueprint, "Jita IV-4")).toBe(
      "A Corp — Jita IV-4",
    );
  });

  // The location is only known once the assets covering that blueprint have arrived.
  it("names the holder alone while the location is unknown", () => {
    expect(blueprintHolderLabel(characterBlueprint)).toBe("Aura");
  });

  // The shared owner lookup names the kind it could not resolve, which is more than the library
  // used to say and is what the asset views say too.
  it("says so when the holder is not one the account tracks", () => {
    expect(blueprintHolderLabel({ ownerId: "hash-z" }, "Jita IV-4")).toBe(
      "Unknown character — Jita IV-4",
    );
  });

  it("says so when a row carries no holder at all", () => {
    expect(blueprintHolderLabel({}, "Jita IV-4")).toBe("unknown — Jita IV-4");
  });
});
