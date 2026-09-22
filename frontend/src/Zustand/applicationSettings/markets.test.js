import { beforeEach, describe, expect, it } from "vitest";
import { create } from "zustand";

import { marketActions } from "./markets.js";
import { addMarket } from "../../Components/Settings/Standard Layout/Market Locations/marketWriter.js";

const azbel = { id: "market-1", name: "Perimeter Azbel", structureID: 1 };

let store;
const saved = () => store.getState().applicationSettings.marketLocations;
const act = () => store.getState().actions;

beforeEach(() => {
  store = create((set) => ({
    applicationSettings: { marketLocations: [], other: "left alone" },
    actions: marketActions(set),
  }));
});

describe("the markets an account saved", () => {
  // What a change does to a lane is decided once, by `marketWriter`, so this
  // holds only that the transform reaches the account's own document.
  it("applies a transform to the lane", () => {
    act().writeMarketLocations((lane) => addMarket(lane, azbel));

    expect(saved().map((market) => market.id)).toEqual(["market-1"]);
  });

  it("hands the transform what is stored now", () => {
    act().writeMarketLocations((lane) => addMarket(lane, azbel));
    act().writeMarketLocations((lane) =>
      addMarket(lane, { ...azbel, id: "market-2" }),
    );

    expect(saved()).toHaveLength(2);
  });

  // The store merges one key deep, so an updater naming the slice replaces it
  // whole — every other setting has to come across with it.
  it("leaves the rest of the settings alone", () => {
    act().writeMarketLocations((lane) => addMarket(lane, azbel));

    expect(store.getState().applicationSettings.other).toBe("left alone");
  });

  // An account whose document has never carried the lane reads as undefined,
  // and a transform handed undefined would throw rather than save.
  it("starts from an empty lane when the document has none", () => {
    store.setState({ applicationSettings: {} });

    act().writeMarketLocations((lane) => addMarket(lane, azbel));

    expect(saved()).toHaveLength(1);
  });

  it("does nothing when handed something that is not a transform", () => {
    act().writeMarketLocations(null);

    expect(saved()).toEqual([]);
  });
});
