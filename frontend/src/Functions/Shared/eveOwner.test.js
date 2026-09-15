import { beforeEach, describe, expect, it, vi } from "vitest";

const { account } = vi.hoisted(() => ({ account: { actions: {} } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

import { ownerImageUrl, ownerName } from "./eveOwner";
import { OWNER_KIND } from "./ownerKind";

const CHARACTER = { kind: OWNER_KIND.CHARACTER, id: "hash-a" };
const CORPORATION = { kind: OWNER_KIND.CORPORATION, id: 98000001 };

beforeEach(() => {
  account.actions = {
    findCharacterByHash: (hash) =>
      hash === "hash-a"
        ? { CharacterID: 2114000001, CharacterName: "Aura" }
        : undefined,
    getCorporation: (id) =>
      Number(id) === 98000001 ? { corporationName: "A Corp" } : undefined,
  };
});

describe("an owner", () => {
  it("is drawn at the size it is shown at", () => {
    expect(ownerImageUrl(CHARACTER, 36)).toContain("size=64");
    expect(ownerImageUrl(CORPORATION, 36)).toContain("size=64");
  });

  it("is drawn from the character's id, not the hash it is held by", () => {
    expect(ownerImageUrl(CHARACTER)).toBe(
      "https://images.evetech.net/characters/2114000001/portrait?size=32",
    );
  });

  it("is drawn from the corporation's own id", () => {
    expect(ownerImageUrl(CORPORATION)).toBe(
      "https://images.evetech.net/corporations/98000001/logo?size=32",
    );
  });

  it("has no image when the account does not know the character", () => {
    expect(
      ownerImageUrl({ kind: OWNER_KIND.CHARACTER, id: "hash-z" }),
    ).toBeUndefined();
    expect(ownerImageUrl(null)).toBeUndefined();
  });

  it("is named by what the account calls it", () => {
    expect(ownerName(CHARACTER)).toBe("Aura");
    expect(ownerName(CORPORATION)).toBe("A Corp");
    expect(ownerName(null)).toBe("");
  });
});
