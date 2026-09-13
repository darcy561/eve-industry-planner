import { describe, expect, it } from "vitest";
import flattenAssetTree, { ASSET_ROW } from "./flattenAssetTree";
import buildAssetNodes from "./buildAssetNodes";
import { assetRowsByLocation, orderLocations } from "./assetTree";
import {
  characterAssetRows,
  corporationAssetRows,
  JITA_STATION_ID,
} from "../../tests/assetFixtures";

const itemRecords = {
  34: { name: "Tritanium" },
  35: { name: "Pyerite" },
  36: { name: "Mexallon" },
  3465: { name: "Container" },
};

const HANGARS = [
  { assetLocationRef: "CorpSAG1", name: "Division 1" },
  { assetLocationRef: "CorpSAG3", name: "Division 3" },
];

function characterView(expanded, excludeItemIds, search) {
  const collection = buildAssetNodes(characterAssetRows);
  const locations = orderLocations(
    assetRowsByLocation(collection, {
      excludeRootFlags: ["Deliveries", "AssetSafety"],
    }),
    { [JITA_STATION_ID]: { name: "Jita IV-4" } },
  ).filter(({ locationId }) => locationId === JITA_STATION_ID);

  return flattenAssetTree({
    locations,
    expanded: new Set(expanded),
    byItemId: collection.byItemId,
    itemRecords,
    excludeItemIds,
    containerNames: new Map([[1002, { name: "Ore Crate" }]]),
    search,
  });
}

function corporationView(expanded) {
  const collection = buildAssetNodes(corporationAssetRows);
  const locations = orderLocations(assetRowsByLocation(collection), {
    [JITA_STATION_ID]: { name: "Jita IV-4" },
  });

  return flattenAssetTree({
    locations,
    expanded: new Set(expanded),
    byItemId: collection.byItemId,
    itemRecords,
    compartments: HANGARS,
  });
}

const LOCATION = `location:${JITA_STATION_ID}`;

describe("the rows on screen", () => {
  it("shows a location closed to begin with", () => {
    const flat = characterView([]);

    expect(flat).toHaveLength(1);
    expect(flat[0]).toMatchObject({
      kind: ASSET_ROW.LOCATION,
      depth: 0,
      label: "Jita IV-4",
      expandable: true,
    });
  });

  it("shows what is at a location once it is open, in name order", () => {
    const flat = characterView([LOCATION]);

    expect(flat.slice(1).map(({ node }) => node.itemId)).toEqual([1002, 1001]);
    expect(flat[1].expandable).toBe(true);
    expect(flat[2].expandable).toBe(false);
  });

  it("shows a container's contents only when the container is open", () => {
    const closed = characterView([LOCATION]);
    const open = characterView([LOCATION, "item:1002"]);

    expect(closed.some(({ node }) => node?.itemId === 1003)).toBe(false);
    const contents = open.filter(({ node }) => node?.itemId === 1003);
    expect(contents).toHaveLength(1);
    expect(contents[0].depth).toBe(2);
  });

  // A key names what the row is, not where it sits, so a refetch that reorders keeps it open.
  it("keys a row on what it is", () => {
    expect(characterView([LOCATION])[1].key).toBe("item:1002");
  });

  it("stripes by position among siblings", () => {
    const flat = characterView([LOCATION, "item:1002"]);
    const contents = flat.filter(({ depth }) => depth === 2);

    expect(contents.map(({ index }) => index)).toEqual([0, 1]);
  });
});

// Blueprints are left out of the asset views, and what is hidden cannot be counted or opened to.
describe("rows the view was told to hide", () => {
  it("leaves out a hidden item at a location", () => {
    const flat = characterView([LOCATION], new Set([1001]));

    expect(flat.slice(1).map(({ node }) => node.itemId)).toEqual([1002]);
  });

  it("leaves out a hidden item inside a container", () => {
    const flat = characterView([LOCATION, "item:1002"], new Set([1003]));

    expect(flat.some(({ node }) => node?.itemId === 1003)).toBe(false);
    expect(flat.some(({ node }) => node?.itemId === 1004)).toBe(true);
  });

  it("makes a container holding only hidden items a leaf", () => {
    const flat = characterView([LOCATION], new Set([1003, 1004]));
    const container = flat.find(({ node }) => node?.itemId === 1002);

    expect(container.expandable).toBe(false);
  });
});

// A search is answered rather than browsed.
describe("searching the tree", () => {
  it("shows what matches without the location being opened first", () => {
    const flat = characterView([], undefined, "mexallon");

    expect(flat[0].kind).toBe(ASSET_ROW.LOCATION);
    expect(flat.map(({ node }) => node?.itemId).filter(Boolean)).toEqual([
      1002, 1004, 1005,
    ]);
  });

  it("keeps the containers above a match so the player can see which to open", () => {
    const flat = characterView([], undefined, "mexallon");

    expect(flat.find(({ node }) => node?.itemId === 1002).expandable).toBe(
      true,
    );
    expect(flat.some(({ node }) => node?.itemId === 1003)).toBe(false);
  });

  it("finds a container by the name its owner gave it", () => {
    const flat = characterView([], undefined, "ore crate");

    expect(flat.some(({ node }) => node?.itemId === 1002)).toBe(true);
  });

  it("shows everything at a location whose own name matches", () => {
    const flat = characterView([], undefined, "jita");

    expect(flat.some(({ node }) => node?.itemId === 1001)).toBe(true);
    expect(flat.some(({ node }) => node?.itemId === 1003)).toBe(true);
  });

  it("leaves out a location with nothing matching", () => {
    const flat = characterView([], undefined, "mexallon");

    expect(flat.filter(({ kind }) => kind === ASSET_ROW.LOCATION)).toHaveLength(
      1,
    );
  });

  it("shows the whole tree again once the search is cleared", () => {
    expect(characterView([], undefined, "   ")).toEqual(characterView([]));
  });
});

describe("the rows of a corporation's office", () => {
  it("puts every hangar division under the location, in the corporation's order", () => {
    const flat = corporationView([LOCATION]);

    expect(flat.slice(1).map(({ label }) => label)).toEqual([
      "Division 1",
      "Division 3",
    ]);
  });

  it("files a division's assets under it", () => {
    const flat = corporationView([
      LOCATION,
      `compartment:${JITA_STATION_ID}:CorpSAG3`,
    ]);

    expect(flat.filter(({ kind }) => kind === ASSET_ROW.ITEM)).toHaveLength(1);
    expect(flat.at(-1).node.itemId).toBe(2002);
  });

  // A division holding nothing says so on its own row rather than offering to open onto nothing.
  it("offers nothing to open on a division holding nothing", () => {
    const collection = buildAssetNodes([]);
    const flat = flattenAssetTree({
      locations: [{ locationId: JITA_STATION_ID, name: "Jita IV-4", rows: [] }],
      expanded: new Set([LOCATION]),
      byItemId: collection.byItemId,
      itemRecords,
      compartments: HANGARS,
    });

    const divisions = flat.filter(({ kind }) => kind === ASSET_ROW.COMPARTMENT);
    expect(divisions).toHaveLength(2);
    expect(
      divisions.every(({ expandable, count }) => !expandable && count === 0),
    ).toBe(true);
  });

  it("counts the stacks a division holds, containers included", () => {
    const flat = corporationView([LOCATION]);
    const divisions = flat.filter(({ kind }) => kind === ASSET_ROW.COMPARTMENT);

    // Division 3 holds a crate with a stack inside it; division 1 holds one stack.
    expect(divisions.find(({ label }) => label === "Division 3").count).toBe(2);
    expect(divisions.find(({ label }) => label === "Division 1").count).toBe(1);
  });
});
