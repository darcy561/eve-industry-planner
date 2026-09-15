import { describe, expect, it } from "vitest";

import {
  characterImageUrl,
  corporationImageUrl,
  TYPE_IMAGE,
  typeImageUrl,
} from "./eveImage";

// EVE's image server answers any other size with a 400 and no image, which shows as a picture that
// silently never loads.
const SERVED_SIZES = [32, 64, 128, 256, 512, 1024];

const sizeOf = (url) => Number(new URL(url).searchParams.get("size"));

describe("the size asked of EVE's image server", () => {
  it("is a size the server serves, whatever it is drawn at", () => {
    for (const pixels of [1, 18, 24, 32, 45, 48, 90, 96, 200, 4000]) {
      expect(SERVED_SIZES).toContain(
        sizeOf(typeImageUrl(34, TYPE_IMAGE.ICON, pixels)),
      );
    }
  });

  it("never asks for less than what is drawn", () => {
    expect(sizeOf(typeImageUrl(34, TYPE_IMAGE.ICON, 36))).toBe(64);
    expect(sizeOf(typeImageUrl(34, TYPE_IMAGE.ICON, 64))).toBe(64);
    expect(sizeOf(typeImageUrl(34, TYPE_IMAGE.ICON, 90))).toBe(128);
  });
});

describe("what the url addresses", () => {
  it("names an item by its type and the variation asked for", () => {
    expect(typeImageUrl(34, TYPE_IMAGE.ICON, 32)).toBe(
      "https://images.evetech.net/types/34/icon?size=32",
    );
    expect(typeImageUrl(1002, TYPE_IMAGE.BLUEPRINT_COPY, 64)).toBe(
      "https://images.evetech.net/types/1002/bpc?size=64",
    );
  });

  it("shows an item's icon unless told otherwise", () => {
    expect(typeImageUrl(34)).toBe(
      "https://images.evetech.net/types/34/icon?size=32",
    );
  });

  it("names each variation as the image server knows it", () => {
    expect(Object.values(TYPE_IMAGE)).toEqual(["icon", "bp", "bpc", "relic"]);
  });

  it("names a character's portrait and a corporation's logo", () => {
    expect(characterImageUrl(2114000001, 64)).toBe(
      "https://images.evetech.net/characters/2114000001/portrait?size=64",
    );
    expect(corporationImageUrl(98000001, 32)).toBe(
      "https://images.evetech.net/corporations/98000001/logo?size=32",
    );
  });
});

describe("with nothing to ask about", () => {
  it("answers with no url rather than one the server cannot serve", () => {
    for (const id of [undefined, null, 0, ""]) {
      expect(typeImageUrl(id)).toBeUndefined();
      expect(characterImageUrl(id)).toBeUndefined();
      expect(corporationImageUrl(id)).toBeUndefined();
    }
  });
});
