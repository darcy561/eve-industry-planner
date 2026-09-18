import { describe, expect, it } from "vitest";

import { clearCharacterEsiCache } from "./characterEsiCache.js";
import { testQueryClient } from "../../tests/queryClients.js";

describe("clearing what is held for a character", () => {
  it("drops that character's collections", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(["characterSkills", "hash-1"], ["a skill"]);
    queryClient.setQueryData(["characterAssets", "hash-1"], ["an asset"]);

    clearCharacterEsiCache(queryClient, "hash-1");

    expect(
      queryClient.getQueryData(["characterSkills", "hash-1"]),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(["characterAssets", "hash-1"]),
    ).toBeUndefined();
  });

  it("leaves another character's alone", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(["characterSkills", "hash-2"], ["theirs"]);

    clearCharacterEsiCache(queryClient, "hash-1");

    expect(queryClient.getQueryData(["characterSkills", "hash-2"])).toEqual([
      "theirs",
    ]);
  });

  // Corporation collections are keyed by corporation and shared by every member, so clearing one
  // member's data must not take the corporation's with it.
  it("leaves the corporation's collections alone", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(["corporationBlueprints", 98000001], ["shared"]);

    clearCharacterEsiCache(queryClient, "hash-1");

    expect(
      queryClient.getQueryData(["corporationBlueprints", 98000001]),
    ).toEqual(["shared"]);
  });

  // A row with no hash would otherwise match every query key that contains an empty string.
  it("does nothing without a character to clear", () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(["characterSkills", "hash-1"], ["a skill"]);

    clearCharacterEsiCache(queryClient, "");

    expect(queryClient.getQueryData(["characterSkills", "hash-1"])).toEqual([
      "a skill",
    ]);
  });
});
