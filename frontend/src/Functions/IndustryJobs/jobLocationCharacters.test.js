import { describe, expect, it } from "vitest";
import jobLocationCharacters from "./jobLocationCharacters";

const RAITARU = 1035466617946;
const characters = [{ CharacterID: 95465499, CharacterHash: "hash-builder" }];

describe("the character an industry job's place can be named by", () => {
  it("is the installer of a match straight from ESI", () => {
    const pairs = jobLocationCharacters(
      [{ installer_id: 95465499, facility_id: RAITARU }],
      characters,
    );

    expect(pairs).toContainEqual([RAITARU, "hash-builder"]);
  });

  it("is the hash a stored row was linked under", () => {
    const pairs = jobLocationCharacters([
      { CharacterHash: "hash-builder", station_id: RAITARU },
    ]);

    expect(pairs).toContainEqual([RAITARU, "hash-builder"]);
  });

  // An installer who is not one of the account's characters — a corporation job run by somebody
  // else — says nothing about who can see the place, and the walk is left as it was.
  it("is nobody when the installer is not on the account", () => {
    const pairs = jobLocationCharacters(
      [{ installer_id: 90000001, facility_id: RAITARU }],
      characters,
    );

    expect(pairs).toEqual([
      [undefined, null],
      [RAITARU, null],
      [undefined, null],
    ]);
  });
});
