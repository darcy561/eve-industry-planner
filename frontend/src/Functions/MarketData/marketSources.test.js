import { describe, expect, it } from "vitest";

import GLOBAL_CONFIG from "../../global-config-app";
import {
  SOURCE_KIND,
  allMarketSources,
  sourceIn,
  sourceNameIn,
} from "./marketSources";

describe("the market source registry", () => {
  // Every surface that offers a market reads this, so a registry that lost the
  // hubs would empty every picker in the app at once.
  it("carries every hub the app is configured with", () => {
    expect(allMarketSources().map((source) => source.id)).toEqual(
      GLOBAL_CONFIG.MARKET_OPTIONS.map((hub) => hub.id),
    );
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
