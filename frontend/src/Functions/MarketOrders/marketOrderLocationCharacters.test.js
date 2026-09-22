import { describe, expect, it } from "vitest";
import marketOrderLocationCharacters from "./marketOrderLocationCharacters";

const RAITARU = 1035466617946;

describe("the character a market order's location can be named by", () => {
  it("is the character the order was listed by", () => {
    expect(
      marketOrderLocationCharacters([
        { location_id: RAITARU, CharacterHash: "hash-seller" },
      ]),
    ).toEqual([[RAITARU, "hash-seller"]]);
  });

  // A corporation order carries no hash of its own, and the place is asked for the way it always
  // was rather than on a guess.
  it("is nobody when the order names none", () => {
    expect(marketOrderLocationCharacters([{ location_id: RAITARU }])).toEqual([
      [RAITARU, null],
    ]);
  });
});
