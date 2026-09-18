import { beforeEach, describe, expect, it, vi } from "vitest";

const upsertCloudStoredEsiRefreshTokens = vi.fn(async () => true);

vi.mock("../Endpoints/Private/cloudStoredEsiRefreshTokens.js", () => ({
  upsertCloudStoredEsiRefreshTokens: (...args) =>
    upsertCloudStoredEsiRefreshTokens(...args),
}));

const {
  buildTokenOverridesFromCharacters,
  submitCloudLinkedCharacterRefreshTokens,
} = await import("./linkedCharacterTokens.js");

describe("sending linked characters' refresh secrets to the server", () => {
  beforeEach(() => {
    upsertCloudStoredEsiRefreshTokens.mockClear();
    upsertCloudStoredEsiRefreshTokens.mockResolvedValue(true);
  });

  it("sends what it was given", async () => {
    await submitCloudLinkedCharacterRefreshTokens(
      new Map([["hash-1", "token-1"]]),
    );

    expect(upsertCloudStoredEsiRefreshTokens).toHaveBeenCalledWith([
      { CharacterHash: "hash-1", rToken: "token-1" },
    ]);
  });

  // A request that carries nothing is a round trip for no reason, and the server would have to
  // decide what an empty write means.
  it("makes no request when nothing usable was given", async () => {
    await submitCloudLinkedCharacterRefreshTokens(new Map());
    await submitCloudLinkedCharacterRefreshTokens(
      new Map([
        ["  ", "token-1"],
        ["hash-2", ""],
      ]),
    );

    expect(upsertCloudStoredEsiRefreshTokens).not.toHaveBeenCalled();
  });

  it("raises a refused write rather than reporting success", async () => {
    upsertCloudStoredEsiRefreshTokens.mockResolvedValue(false);

    await expect(
      submitCloudLinkedCharacterRefreshTokens(new Map([["hash-1", "token-1"]])),
    ).rejects.toThrow(/failed to submit/i);
  });
});

describe("the secrets the roster is holding", () => {
  it("collects the linked characters' own", () => {
    const overrides = buildTokenOverridesFromCharacters([
      { CharacterHash: "hash-1", esiRefreshToken: "token-1" },
      { CharacterHash: " hash-2 ", esiRefreshToken: " token-2 " },
    ]);

    expect([...overrides.entries()]).toEqual([
      ["hash-1", "token-1"],
      ["hash-2", "token-2"],
    ]);
  });

  // The main character's secret is the account's own — it does not travel with the linked ones.
  it("leaves the main character out", () => {
    const overrides = buildTokenOverridesFromCharacters([
      {
        CharacterHash: "main",
        esiRefreshToken: "token-0",
        isMainCharacter: true,
      },
      { CharacterHash: "hash-1", esiRefreshToken: "token-1" },
    ]);

    expect([...overrides.keys()]).toEqual(["hash-1"]);
  });

  it("skips a character with nothing to send", () => {
    const overrides = buildTokenOverridesFromCharacters([
      { CharacterHash: "hash-1" },
      { CharacterHash: "", esiRefreshToken: "token-2" },
      null,
    ]);

    expect(overrides.size).toBe(0);
  });
});
