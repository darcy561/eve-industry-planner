import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

let characters = [];
let storedName = null;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters,
        actions: {
          getMainCharacter: () =>
            characters.find((entry) => entry?.isMainCharacter) || null,
          getMainCharacterName: () => storedName,
        },
      },
    }),
  );
});

const { useMainCharacter } = await import("./useMainCharacter.js");

describe("the character an account signs in as", () => {
  beforeEach(() => {
    characters = [];
    storedName = null;
  });

  it("is the one the roster marks", () => {
    characters = [
      { CharacterName: "Linked Alt" },
      { CharacterName: "Oswold Saraki", isMainCharacter: true },
    ];

    const { result } = renderHook(() => useMainCharacter());

    expect(result.current.character.CharacterName).toBe("Oswold Saraki");
    expect(result.current.name).toBe("Oswold Saraki");
  });

  // A session that has resumed but not yet rebuilt the roster still knows the name.
  it("falls back to the stored name before the roster exists", () => {
    storedName = "Oswold Saraki";

    const { result } = renderHook(() => useMainCharacter());

    expect(result.current.character).toBeFalsy();
    expect(result.current.name).toBe("Oswold Saraki");
  });

  it("reads as unknown rather than blank when neither is held", () => {
    const { result } = renderHook(() => useMainCharacter());

    expect(result.current.name).toBe("—");
  });
});
