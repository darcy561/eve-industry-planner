import { beforeEach, describe, expect, it, vi } from "vitest";

import GLOBAL_CONFIG from "../../global-config-app";

let markets = [];

let composed;
vi.mock("./marketLocations", () => ({
  marketsToOffer: () => composed ?? markets,
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ applicationSettings: { marketLocations: markets } }),
  );
});

const {
  SOURCE_KIND,
  allMarketSources,
  answersAPerTypeProbe,
  isReadByTheReader,
  persistsAcrossSessions,
  citadelsInRegion,
  savedCitadels,
  sourceIn,
  sourceNameIn,
} = await import("./marketSources");

beforeEach(() => {
  markets = [];
  composed = undefined;
});

describe("the market source registry", () => {
  // Every surface that offers a market reads this, so a registry that lost the
  // hubs would empty every picker in the app at once.
  it("carries every hub the app is configured with", () => {
    expect(allMarketSources().map((source) => source.id)).toEqual(
      GLOBAL_CONFIG.MARKET_OPTIONS.map((hub) => hub.id),
    );
  });

  // A reader who saves a market expects to be offered it wherever a market is
  // offered, and every such surface reads this one function.
  it("carries the NPC stations a reader has saved", () => {
    markets = [
      {
        id: "npcMarket-1",
        name: "Jita IV-4",
        regionID: 10000002,
        stationID: 60003760,
      },
    ];

    const saved = sourceIn(allMarketSources(), "npcMarket-1");

    expect(saved).toMatchObject({
      name: "Jita IV-4",
      regionID: 10000002,
      stationID: 60003760,
      // The kind decides transport and cache tier: a saved station's prices are
      // read by the browser and held on the reader's device.
      kind: SOURCE_KIND.STATION,
    });
  });

  it("carries the citadels a reader has saved", () => {
    markets = [
      {
        id: "citadelMarket-1",
        name: "Perimeter Azbel",
        regionID: 10000002,
        structureID: 1035466617946,
      },
    ];

    const saved = sourceIn(allMarketSources(), "citadelMarket-1");

    expect(saved).toMatchObject({
      name: "Perimeter Azbel",
      structureID: 1035466617946,
      // Read on the reader's own token and held on their device, both of which
      // follow from the kind and from nothing else.
      kind: SOURCE_KIND.CITADEL,
    });
  });

  // A market with no place named is a market with nowhere to ask about it.
  it("does not carry a saved market that names no place", () => {
    markets = [
      {
        id: "citadelMarket-2",
        name: "Half-filled in",
        regionID: 10000002,
      },
    ];

    expect(sourceIn(allMarketSources(), "citadelMarket-2")).toBeUndefined();
  });

  // The region and station are what a price is fetched and filtered by, so a
  // source that dropped them would look right in a picker and price nothing.
  it("keeps what a source is priced by", () => {
    for (const hub of GLOBAL_CONFIG.MARKET_OPTIONS) {
      expect(sourceIn(allMarketSources(), hub.id)).toMatchObject({
        name: hub.name,
        regionID: hub.regionID,
        stationID: hub.stationID,
      });
    }
  });

  // The kind is how the price layer will decide who fetches a source and where
  // it is held. Everything the server prices is marked as its own.
  it("marks every hub as one the server holds", () => {
    for (const source of allMarketSources()) {
      expect(source.kind).toBe(SOURCE_KIND.HUB);
    }
  });

  it("builds a fresh list rather than handing out one to mutate", () => {
    const first = allMarketSources();
    first.pop();
    expect(allMarketSources()).toHaveLength(
      GLOBAL_CONFIG.MARKET_OPTIONS.length,
    );
  });
});

describe("reading one source out of a registry", () => {
  const sources = [
    { id: "jita", name: "Jita" },
    { id: "amarr", name: "Amarr" },
  ];

  it("finds a source by id", () => {
    expect(sourceIn(sources, "amarr")).toEqual({ id: "amarr", name: "Amarr" });
  });

  it("answers nothing for a source the registry does not carry", () => {
    expect(sourceIn(sources, "rens")).toBeUndefined();
  });

  // Callers read the registry before it can be guaranteed to exist — a reducer
  // built from stored state, a helper handed whatever a component had.
  it("answers nothing rather than throwing on no registry", () => {
    expect(sourceIn(undefined, "jita")).toBeUndefined();
    expect(sourceIn(null, "jita")).toBeUndefined();
  });
});

describe("the citadels saved in one region", () => {
  const forge = 10000002;
  const sources = [
    { id: "jita", kind: "hub", regionID: forge },
    { id: "npc", kind: "station", regionID: forge },
    { id: "perimeter", kind: "citadel", regionID: forge },
    { id: "tranquility-trading", kind: "citadel", regionID: forge },
    { id: "elsewhere", kind: "citadel", regionID: 10000043 },
  ];

  // A region-wide view wants every private market in it, not the one a picker
  // happens to be set to.
  it("finds every citadel in the region", () => {
    expect(citadelsInRegion(sources, forge).map((s) => s.id)).toEqual([
      "perimeter",
      "tranquility-trading",
    ]);
  });

  // A hub and an NPC station are priced by the server from the region's own
  // orders, which the caller already has.
  it("leaves out the markets that are not read here", () => {
    expect(
      citadelsInRegion(sources, forge).every((s) => s.kind === "citadel"),
    ).toBe(true);
  });

  it("leaves out a citadel in another region", () => {
    expect(citadelsInRegion(sources, 10000043).map((s) => s.id)).toEqual([
      "elsewhere",
    ]);
  });

  // A region id survives a round trip through stored settings and a route
  // param, and nothing guarantees which side is holding text.
  it("matches a region id held as text against one asked for as a number", () => {
    expect(
      citadelsInRegion(
        [{ id: "a", kind: "citadel", regionID: "10000002" }],
        forge,
      ),
    ).toHaveLength(1);
  });

  // A caller reaching for a region it does not have yet is asking about nowhere,
  // and the reader's whole set would have a surface quietly showing markets from
  // everywhere.
  it("answers nothing without a region rather than every citadel", () => {
    expect(citadelsInRegion(sources, undefined)).toEqual([]);
  });

  it("answers nothing rather than throwing on no registry", () => {
    expect(citadelsInRegion(undefined, forge)).toEqual([]);
  });
});

describe("every citadel a reader has saved", () => {
  const sources = [
    { id: "jita", kind: "hub", regionID: 10000002 },
    { id: "npc", kind: "station", regionID: 10000002 },
    { id: "perimeter", kind: "citadel", regionID: 10000002 },
    { id: "elsewhere", kind: "citadel", regionID: 10000043 },
  ];

  // The markets a job can sell from, wherever they are.
  it("takes them from every region", () => {
    expect(savedCitadels(sources).map((s) => s.id)).toEqual([
      "perimeter",
      "elsewhere",
    ]);
  });

  // A hub and an NPC station are priced by the server from a region's own
  // orders, and neither is read on the reader's token.
  it("leaves out the markets that are not read here", () => {
    expect(savedCitadels(sources).every((s) => s.kind === "citadel")).toBe(
      true,
    );
  });

  it("answers nothing rather than throwing on no registry", () => {
    expect(savedCitadels(undefined)).toEqual([]);
  });
});

describe("naming a source", () => {
  const sources = [{ id: "jita", name: "Jita" }];

  it("gives the name the registry holds", () => {
    expect(sourceNameIn(sources, "jita")).toBe("Jita");
  });

  // A market a reader chose and then removed still labels its figures. Showing
  // the id is what lets them recognise the stale choice; a blank would not.
  it("falls back to the id for a market it does not carry", () => {
    expect(sourceNameIn(sources, "rens")).toBe("rens");
    expect(sourceNameIn(undefined, "rens")).toBe("rens");
  });
});

// Three questions, one table. They line up for the kinds there are today, which
// is exactly why they are asked separately: a kind this server prices but the
// reader must authenticate for would split them, and one predicate standing in
// for three would be wrong in three places at once.
describe("what follows from a kind", () => {
  const ASKED = {
    persistsAcrossSessions,
    isReadByTheReader,
    answersAPerTypeProbe,
  };

  it.each([
    [SOURCE_KIND.HUB, false, false, true],
    [SOURCE_KIND.STATION, false, false, true],
    [SOURCE_KIND.CITADEL, true, true, false],
  ])("answers for %s", (kind, persists, readByReader, probes) => {
    expect(persistsAcrossSessions(kind)).toBe(persists);
    expect(isReadByTheReader(kind)).toBe(readByReader);
    expect(answersAPerTypeProbe(kind)).toBe(probes);
  });

  // A kind nothing knows about is treated as the cheapest thing to be wrong
  // about: fetched again rather than served from a tier nothing wrote.
  it.each(Object.entries(ASKED))(
    "answers %s safely for a kind it does not know",
    (_name, ask) => {
      expect(typeof ask(undefined)).toBe("boolean");
      expect(typeof ask("a kind from a later release")).toBe("boolean");
    },
  );

  it("does not keep an unknown kind on the reader's device", () => {
    expect(persistsAcrossSessions("a kind from a later release")).toBe(false);
    expect(isReadByTheReader("a kind from a later release")).toBe(false);
  });
});

// What a reader may price against is composed by the server: their own markets
// plus the ones each organisation they belong to has shared. The account's own
// lane answers until that arrives, so a reader part-way through signing in is
// offered the markets they saved rather than none.
describe("the markets the server composed", () => {
  it("are what the registry offers once they have arrived", () => {
    markets = [{ id: "own", name: "Mine", regionID: 1, stationID: 60003760 }];
    composed = [
      { id: "shared", name: "The corporation's", regionID: 1, structureID: 99 },
    ];

    const ids = allMarketSources().map((source) => source.id);

    expect(ids).toContain("shared");
    expect(ids).not.toContain("own");
  });

  it("leave the account's own lane answering until they do", () => {
    markets = [{ id: "own", name: "Mine", regionID: 1, stationID: 60003760 }];

    expect(allMarketSources().map((source) => source.id)).toContain("own");
  });

  // An account that genuinely has none is an answer, not an absence: falling
  // back to its own lane here would offer markets the server did not compose.
  it("offer nothing for an account the server says has none", () => {
    markets = [{ id: "own", name: "Mine", regionID: 1, stationID: 60003760 }];
    composed = [];

    expect(allMarketSources().map((source) => source.id)).not.toContain("own");
  });
});
