import { describe, expect, it } from "vitest";
import buildAssetNodes from "./buildAssetNodes";
import {
  assetRowsByLocation,
  locationOptions,
  namedContainerIds,
  rowsByCompartment,
  sortNodesByName,
} from "./assetTree";
import {
  characterAssetRows,
  corporationAssetRows,
  JITA_STATION_ID,
} from "../../tests/assetFixtures";

const characters = buildAssetNodes(characterAssetRows);
const corporation = buildAssetNodes(corporationAssetRows);

const itemIds = (nodes) =>
  nodes.map((node) => node.itemId).sort((a, b) => a - b);

describe("the top rows at a location", () => {
  it("takes what sits directly there and not what is inside a container", () => {
    const rows = assetRowsByLocation(characters).get(JITA_STATION_ID);

    // 1003 and 1005 are inside container 1002, and 1008 inside 1007.
    expect(itemIds(rows)).toEqual([1001, 1002, 1006, 1007]);
  });

  it("narrows on the compartment a row sits in", () => {
    const deliveries = assetRowsByLocation(characters, {
      rootFlags: ["Deliveries"],
    });

    expect(itemIds(deliveries.get(JITA_STATION_ID))).toEqual([1006, 1007]);
  });

  // The raw location_flag cannot express this: item 1008 sits inside the delivered container and
  // carries "Unlocked", so a filter on the raw flag would leave it in the Assets view.
  it("keeps a container's contents with the compartment holding it", () => {
    const assets = assetRowsByLocation(characters, {
      excludeRootFlags: ["Deliveries", "AssetSafety"],
    });
    const shown = assets.get(JITA_STATION_ID);

    expect(itemIds(shown)).toEqual([1001, 1002]);
    expect(characters.byItemId.get(1008).rootFlag).toBe("Deliveries");
  });

  it("reads an office folder through rather than as a row", () => {
    const rows = assetRowsByLocation(corporation).get(JITA_STATION_ID);

    // 2001 is the folder itself; 2002 and 2004 are the hangar contents inside it.
    expect(itemIds(rows)).toEqual([2002, 2004]);
  });

  // Blueprints are left out of the asset views, so a location holding only those is not a location
  // the view has anything to show for.
  it("leaves out the items it was told to exclude", () => {
    const rows = assetRowsByLocation(characters, {
      excludeItemIds: new Set([1001]),
    }).get(JITA_STATION_ID);

    expect(itemIds(rows)).toEqual([1002, 1006, 1007]);
  });

  // A corporation renting an office it has emptied still rents it.
  it("keeps a named location that holds nothing", () => {
    const rows = assetRowsByLocation(corporation, {
      includeLocations: [60008494],
    });

    expect(rows.get(60008494)).toEqual([]);
  });

  it("answers nothing without a collection", () => {
    expect(assetRowsByLocation(null).size).toBe(0);
  });
});

describe("a location's rows split by compartment", () => {
  it("keys each hangar division by its flag", () => {
    const rows = assetRowsByLocation(corporation).get(JITA_STATION_ID);
    const byFlag = rowsByCompartment(rows);

    expect(itemIds(byFlag.get("CorpSAG1"))).toEqual([2004]);
    expect(itemIds(byFlag.get("CorpSAG3"))).toEqual([2002]);
    expect(byFlag.has("CorpSAG7")).toBe(false);
  });
});

describe("ordering rows for display", () => {
  const fullItemList = {
    34: { name: "Tritanium" },
    3465: { name: "Container" },
  };

  it("orders by the name of what the row is", () => {
    const rows = [characters.byItemId.get(1001), characters.byItemId.get(1002)];

    expect(sortNodesByName(rows, fullItemList).map((n) => n.itemId)).toEqual([
      1002, 1001,
    ]);
  });

  // The collection is shared by every consumer of the scope.
  it("leaves the collection's own ordering alone", () => {
    const rows = assetRowsByLocation(characters).get(JITA_STATION_ID);
    const before = rows.map((node) => node.itemId);

    sortNodesByName(rows, fullItemList);

    expect(rows.map((node) => node.itemId)).toEqual(before);
  });
});

describe("the containers worth naming", () => {
  it("offers what holds something", () => {
    expect(namedContainerIds(characters).sort((a, b) => a - b)).toEqual([
      1002, 1004, 1007,
    ]);
  });

  // The folder carries no player-given name; its hangars are not containers.
  it("leaves out an office folder", () => {
    expect(namedContainerIds(corporation)).toEqual([2002]);
  });
});

// What every location picker in the app offers, and in what order.
describe("the locations a picker offers", () => {
  const names = {
    1: { name: "Zoohen VII", resolutionStatus: "resolved" },
    2: { name: "Amarr VIII", resolutionStatus: "resolved" },
    3: { name: "No Access To Location - 3", resolutionStatus: "no_access" },
  };

  it("puts a location nobody can read after every named one", () => {
    expect(
      locationOptions([3, 1, 2], names).map(({ locationId }) => locationId),
    ).toEqual([2, 1, 3]);
  });

  it("marks the one nobody can read", () => {
    expect(locationOptions([1, 3], names)).toEqual([
      {
        locationId: 1,
        name: "Zoohen VII",
        unnamed: false,
        unresolved: false,
        unreadable: false,
      },
      {
        locationId: 3,
        name: "No Access To Location - 3",
        unnamed: false,
        unresolved: false,
        unreadable: true,
      },
    ]);
  });

  // ESI answered and had no name for it. That is an answer, so the place is offered saying what
  // little there is to say, rather than dropped as though it were not there.
  it("offers a place nothing can name, under a stand-in label", () => {
    const withNameless = {
      ...names,
      4: { id: 4, resolutionStatus: "unnamed" },
    };

    expect(locationOptions([4], withNameless)).toEqual([
      {
        locationId: 4,
        name: "Unknown Location",
        unnamed: true,
        unresolved: false,
        unreadable: false,
      },
    ]);
  });

  // A failure is never cached, so an id whose lookup did not settle would be offered on every render
  // for the rest of the session under a label saying nothing. A picker leaves it out by default.
  it("holds back a location whose lookup failed", () => {
    expect(locationOptions([1, 9], names)).toEqual([
      {
        locationId: 1,
        name: "Zoohen VII",
        unnamed: false,
        unresolved: false,
        unreadable: false,
      },
    ]);
  });

  // A surface listing where assets are would otherwise drop a place that holds some.
  it("offers a failed location when asked for, saying so", () => {
    expect(locationOptions([1, 9], names, new Set([9]))).toEqual([
      {
        locationId: 1,
        name: "Zoohen VII",
        unnamed: false,
        unresolved: false,
        unreadable: false,
      },
      {
        locationId: 9,
        name: "Name unavailable",
        unnamed: false,
        unresolved: true,
        unreadable: false,
      },
    ]);
  });

  // An id that resolved after all is named, whatever an earlier attempt did.
  it("names a location that resolved even when it is in the failed set", () => {
    const [option] = locationOptions([1], names, new Set([1]));

    expect(option).toMatchObject({ name: "Zoohen VII", unresolved: false });
  });

  it("puts a failed location below the named ones, and above the unreadable", () => {
    expect(
      locationOptions([3, 9, 1, 2], names, new Set([9])).map(
        ({ locationId }) => locationId,
      ),
    ).toEqual([2, 1, 9, 3]);
  });

  // Its stand-in label starts with a letter like any other, so without a rule of its own it would
  // sort into the middle of the real names.
  it("puts a place nothing can name below the named ones, and above the unreadable", () => {
    const mixed = {
      ...names,
      4: { id: 4, resolutionStatus: "unnamed" },
    };

    expect(
      locationOptions([3, 4, 1, 2], mixed).map(({ locationId }) => locationId),
    ).toEqual([2, 1, 4, 3]);
  });

  // A blank row says nothing a reader can act on, and the name is moments away.
  it("holds back a location still being asked about", () => {
    expect(
      locationOptions([1, 99], names).map(({ locationId }) => locationId),
    ).toEqual([1]);
  });
});
