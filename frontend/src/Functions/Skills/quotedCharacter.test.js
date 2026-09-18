import { describe, expect, it, vi } from "vitest";

const reader = { own: [], main: "hash-main" };

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      account: {
        actions: {
          findCharacterByHash: (hash) =>
            reader.own.includes(hash) ? { CharacterHash: hash } : null,
          getMainCharacterHash: () => reader.main,
        },
      },
    }),
  },
}));

const { quotedCharacterHash } = await import("./quotedCharacter.js");

describe("quotedCharacterHash", () => {
  it("keeps the setup's own character when the reader has them", () => {
    reader.own = ["hash-alt"];

    expect(quotedCharacterHash({ selectedCharacter: "hash-alt" })).toBe(
      "hash-alt",
    );
  });

  it("falls back to the reader's main when the character is another member's", () => {
    reader.own = ["hash-alt"];

    expect(quotedCharacterHash({ selectedCharacter: "hash-theirs" })).toBe(
      "hash-main",
    );
  });

  it("falls back when a setup names nobody, or there is no setup", () => {
    reader.own = ["hash-alt"];

    expect(quotedCharacterHash({ selectedCharacter: null })).toBe("hash-main");
    expect(quotedCharacterHash(null)).toBe("hash-main");
  });
});
