import { describe, expect, it } from "vitest";
import { create } from "zustand";
import {
  coreActions,
  mergeApplicationSettingsState,
  stateDefault,
} from "./core.js";

const merge = (incoming, prev = stateDefault()) =>
  mergeApplicationSettingsState(prev, incoming, null);

describe("pricing defaults", () => {
  it("starts both sides on the global default", () => {
    expect(stateDefault().defaultPricing).toEqual({
      buying: { market: "jita", orderType: "sell" },
      selling: { market: "jita" },
    });
  });

  it("keeps the sides apart once the server sends them", () => {
    const merged = merge({
      defaultPricing: {
        buying: { market: "jita", orderType: "sell" },
        selling: { market: "hek", orderType: "buy" },
      },
    });

    expect(merged.defaultPricing.buying).toEqual({
      market: "jita",
      orderType: "sell",
    });
    expect(merged.defaultPricing.selling).toEqual({
      market: "hek",
      exit: "immediate",
    });
  });

  it("keeps the held side when the server sends only the other", () => {
    const merged = merge({
      defaultPricing: { selling: { market: "hek", orderType: "buy" } },
    });

    expect(merged.defaultPricing.buying).toEqual({
      market: "jita",
      orderType: "sell",
    });
    expect(merged.defaultPricing.selling).toEqual({
      market: "hek",
      exit: "immediate",
    });
  });

  it.each([
    ["omitted by Go", {}],
    ["written out in full", { market: "", orderType: "" }],
  ])("keeps what is held when a side arrives %s", (_name, side) => {
    const merged = merge({
      defaultPricing: { buying: { ...side }, selling: { ...side } },
    });

    expect(merged.defaultPricing).toEqual({
      buying: { market: "jita", orderType: "sell" },
      selling: { market: "jita", exit: "listed" },
    });
  });

  it("falls back to the blank state when neither is held nor sent", () => {
    const prev = { ...stateDefault() };
    delete prev.defaultPricing;

    expect(merge({ displayHelpCards: true }, prev).defaultPricing).toEqual({
      buying: { market: "jita", orderType: "sell" },
      selling: { market: "jita", exit: "listed" },
    });
  });

  it("keeps a side's market group defaults when the server sends them", () => {
    const groups = { 1857: { market: "hek" } };

    const merged = merge({
      defaultPricing: {
        buying: { market: "jita", orderType: "sell", groups },
        selling: { market: "amarr", orderType: "buy" },
      },
    });

    expect(merged.defaultPricing.buying.groups).toEqual(groups);
    expect(merged.defaultPricing.selling.groups).toBeUndefined();
  });

  it("keeps groups already held when the server sends a side without them", () => {
    const groups = { 1857: { market: "hek" } };
    const prev = {
      ...stateDefault(),
      defaultPricing: {
        buying: { market: "jita", orderType: "sell", groups },
        selling: { market: "jita", orderType: "sell" },
      },
    };

    const merged = merge({ displayHelpCards: true }, prev);

    expect(merged.defaultPricing.buying.groups).toEqual(groups);
  });

  it("keeps groups on a side that names no market of its own", () => {
    const groups = { 1857: { market: "hek" } };

    const merged = merge({
      defaultPricing: { buying: { groups }, selling: {} },
    });

    expect(merged.defaultPricing.buying).toEqual({
      market: "jita",
      orderType: "sell",
      groups,
    });
  });
});

describe("a chosen route out survives later merges", () => {
  const chosen = () => ({
    ...stateDefault(),
    defaultPricing: {
      buying: { market: "jita", orderType: "sell" },
      selling: { market: "jita", exit: "immediate" },
    },
  });

  it("keeps the route when a merge says nothing about pricing", () => {
    const merged = merge({ displayHelpCards: true }, chosen());

    expect(merged.defaultPricing.selling.exit).toBe("immediate");
  });

  it("takes a route the server sends over the one held", () => {
    const merged = merge(
      { defaultPricing: { selling: { market: "jita", exit: "listed" } } },
      chosen(),
    );

    expect(merged.defaultPricing.selling.exit).toBe("listed");
  });

  it("reads a route from a side the server sent without one", () => {
    const merged = merge(
      { defaultPricing: { selling: { market: "hek", orderType: "sell" } } },
      chosen(),
    );

    expect(merged.defaultPricing.selling.exit).toBe("listed");
  });
});

describe("a market lane this client does not yet use", () => {
  const saved = [
    { id: "market-1", name: "Perimeter Azbel", regionID: 10000002 },
  ];

  it("starts empty rather than absent", () => {
    expect(stateDefault().marketLocations).toEqual([]);
  });

  it("takes what the server holds", () => {
    expect(merge({ marketLocations: saved }).marketLocations).toEqual(saved);
  });

  it("is left alone by an answer that does not mention it", () => {
    const held = merge({ marketLocations: saved });

    expect(merge({ displayHelpCards: false }, held).marketLocations).toEqual(
      saved,
    );
  });

  it("keeps what it holds when the answer is not a list", () => {
    const held = merge({ marketLocations: saved });

    expect(merge({ marketLocations: null }, held).marketLocations).toEqual(
      saved,
    );
  });
});

describe("the account's reprocessing settings", () => {
  it("keep only the default character from a stored document carrying more", () => {
    const merged = merge({
      reprocessingSettings: {
        defaultReprocessingCharacter: "alt-hash",
        preferCompressed: true,
        valueMultiplier: 2,
      },
    });

    expect(merged.reprocessingSettings).toEqual({
      defaultReprocessingCharacter: "alt-hash",
    });
  });

  it("keep the held character when the server says nothing about it", () => {
    const prev = merge({
      reprocessingSettings: { defaultReprocessingCharacter: "alt-hash" },
    });

    expect(
      merge({ displayHelpCards: true }, prev).reprocessingSettings,
    ).toEqual({ defaultReprocessingCharacter: "alt-hash" });
  });

  it("are saved as the default character alone", () => {
    const store = create((set, get) => ({
      applicationSettings: {
        ...stateDefault(),
        reprocessingSettings: { defaultReprocessingCharacter: "alt-hash" },
        actions: coreActions(set, get),
      },
    }));

    expect(
      store.getState().applicationSettings.actions.toPersistPayload()
        .reprocessingSettings,
    ).toEqual({ defaultReprocessingCharacter: "alt-hash" });
  });
});
