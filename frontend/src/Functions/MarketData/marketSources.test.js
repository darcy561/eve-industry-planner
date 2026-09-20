import { beforeEach, describe, expect, it, vi } from "vitest";

import GLOBAL_CONFIG from "../../global-config-app";
import { structureKinds } from "../../Context/defaultValues";

let structures = [];

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } = await import(
    "../../tests/usersStoreHarness.js"
  );
  return usersStoreMock(() =>
    usersStoreState({ applicationSettings: { customStructures: structures } }),
  );
});

const { SOURCE_KIND, allMarketSources, sourceIn, sourceNameIn } = await import(
  "./marketSources"
);

beforeEach(() => {
  structures = [];
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
    structures = [
      {
        id: "npcMarket-1",
        jobType: structureKinds.market,
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
      // The kind decides transport and cache tier: a saved station's book is
      // read by the browser and held on the reader's device.
      kind: SOURCE_KIND.STATION,
    });
  });

  // A citadel's book needs /markets/structures/ and the docking character the
  // row carries. Offering one before that exists would put a market in every
  // picker that no price could be asked for.
  it("does not carry a saved citadel, which nothing can price yet", () => {
    structures = [
      {
        id: "citadelMarket-1",
        jobType: structureKinds.market,
        name: "Perimeter Azbel",
        regionID: 10000002,
        structureID: 1035466617946,
      },
    ];

    expect(sourceIn(allMarketSources(), "citadelMarket-1")).toBeUndefined();
  });

  it("does not carry a structure that is somewhere to build", () => {
    structures = [
      {
        id: "manStruct-1",
        jobType: structureKinds.manufacturing,
        name: "Sotiyo",
      },
    ];

    expect(sourceIn(allMarketSources(), "manStruct-1")).toBeUndefined();
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
