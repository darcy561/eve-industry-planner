import { beforeEach, describe, expect, it, vi } from "vitest";

const { account } = vi.hoisted(() => ({ account: { actions: {} } }));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState({ account }));
});

import { eveImageSize, ownerImageUrl, ownerName } from "./eveOwner";
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

// EVE's image server answers any other size with a 400 and no image, which shows as an avatar that
// silently never loads.
describe("the size asked of EVE's image server", () => {
  it("is a size the server serves", () => {
    for (const pixels of [1, 18, 24, 32, 48, 64, 200, 4000]) {
      expect([32, 64, 128, 256, 512, 1024]).toContain(eveImageSize(pixels));
    }
  });

  it("never asks for less than what is drawn", () => {
    expect(eveImageSize(36)).toBe(64);
    expect(eveImageSize(48)).toBe(64);
    expect(eveImageSize(64)).toBe(64);
  });

  it("puts a servable size in the url", () => {
    expect(ownerImageUrl(CHARACTER, 36)).toContain("size=64");
    expect(ownerImageUrl(CORPORATION, 36)).toContain("size=64");
  });
});

describe("an owner", () => {
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
