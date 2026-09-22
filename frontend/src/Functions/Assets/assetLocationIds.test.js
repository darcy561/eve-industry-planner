import { describe, expect, it } from "vitest";
import assetLocationIds, { assetLocationCharacters } from "./assetLocationIds";
import buildAssetNodes, { buildAssetCollection } from "./buildAssetNodes";
import { OWNER_KIND } from "../Shared/ownerKind";
import {
  ASSET_SAFETY_ID,
  characterAssetRows,
  inSpaceAssetRows,
  JITA_STATION_ID,
  RAITARU_STRUCTURE_ID,
} from "../../tests/assetFixtures";

describe("the locations a collection's assets sit at", () => {
  it("offers a station and a structure once each, however deep the asset is", () => {
    const ids = assetLocationIds(buildAssetNodes(characterAssetRows));

    expect(ids).toContain(JITA_STATION_ID);
    expect(ids).toContain(RAITARU_STRUCTURE_ID);
    expect(ids.filter((id) => id === JITA_STATION_ID)).toHaveLength(1);
  });

  // Items there are held by CONCORD awaiting delivery, not somewhere a player can work from.
  it("leaves out asset safety", () => {
    const ids = assetLocationIds(buildAssetNodes(characterAssetRows));

    expect(ids).not.toContain(ASSET_SAFETY_ID);
  });

  it("offers a system an asset sits in", () => {
    const ids = assetLocationIds(buildAssetNodes(inSpaceAssetRows));

    expect(ids).toEqual([31000123, 32000456]);
  });

  it("answers nothing for an empty collection", () => {
    expect(assetLocationIds(buildAssetNodes([]))).toEqual([]);
    expect(assetLocationIds(undefined)).toEqual([]);
  });
});

// A structure refuses every character without docking rights, so a name lookup starts with one that
// has already seen the place rather than walking the whole account.
describe("the character a collection's locations can be named by", () => {
  const seenBy = (pairs, locationId) =>
    pairs.filter(([id]) => id === locationId).map(([, hash]) => hash);

  it("is the character whose set the row arrived in", () => {
    const collection = buildAssetCollection(
      [characterAssetRows],
      [
        {
          owner: { kind: OWNER_KIND.CHARACTER, id: "hash-main" },
          seenBy: "hash-main",
        },
      ],
    );

    expect(
      seenBy(assetLocationCharacters(collection), RAITARU_STRUCTURE_ID),
    ).toContain("hash-main");
  });

  // A corporation's rows arrive once per member whose roles reach them, and the owner recorded is
  // the corporation — so without the member the office would be walked blind.
  it("is the member that fetched a corporation's rows, not the corporation", () => {
    const collection = buildAssetCollection(
      [characterAssetRows],
      [
        {
          owner: { kind: OWNER_KIND.CORPORATION, id: 98000001 },
          seenBy: "hash-member",
        },
      ],
    );

    expect(
      seenBy(assetLocationCharacters(collection), RAITARU_STRUCTURE_ID),
    ).toContain("hash-member");
  });

  it("is nobody for a collection built without a request behind it", () => {
    const pairs = assetLocationCharacters(buildAssetNodes(characterAssetRows));

    expect(pairs.every(([, hash]) => hash === null)).toBe(true);
  });
});
