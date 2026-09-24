import { describe, expect, it } from "vitest";
import { mergeApplicationSettingsState, stateDefault } from "./core.js";

const merge = (incoming, prev = stateDefault()) =>
  mergeApplicationSettingsState(prev, incoming, null);

describe("pricing defaults", () => {
  it("starts both sides on the global default", () => {
    expect(stateDefault().defaultPricing).toEqual({
      buying: { market: "jita", orderType: "sell" },
      // No route: one seeded here could not be told from one the player chose,
      // and the merge has to keep a choice while still letting a legacy
      // account's stored order type answer on first load.
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

  // A side the server says nothing about keeps what is held rather than
  // following the side it did send.
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

  // Go serialises DefaultPricing whether or not the stored document holds it, so
  // an account written before the split arrives with the key present and each
  // side empty, not with the key missing. Taking that as an answer would
  // overwrite a real default.
  //
  // Both empty shapes are covered: PricingSide's fields are omitempty, so Go
  // sends `{}`, and a document written by anything else may still carry the
  // empty strings.
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

  // Nothing held and nothing sent still has to come out usable, because every
  // priced surface reads these while rendering.
  it("falls back to the blank state when neither is held nor sent", () => {
    const prev = { ...stateDefault() };
    delete prev.defaultPricing;

    expect(merge({ displayHelpCards: true }, prev).defaultPricing).toEqual({
      buying: { market: "jita", orderType: "sell" },
      selling: { market: "jita", exit: "listed" },
    });
  });

  // What is persisted is the merged copy, so a side's group defaults have to
  // survive a merge that is not about them.
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

  // A side the upgrader has not filled can still carry groups: losing them
  // because the market is empty is the bug this guards.
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

// A merge that says nothing about pricing arrives on every unrelated save, and a
// route derived again each time would quietly undo the player's choice — the
// setting would appear to save and then revert.
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

  // A route the server sends is the account's own answer and outranks the one
  // this client happens to hold.
  it("takes a route the server sends over the one held", () => {
    const merged = merge(
      { defaultPricing: { selling: { market: "jita", exit: "listed" } } },
      chosen(),
    );

    expect(merged.defaultPricing.selling.exit).toBe("listed");
  });

  // A document stored before the route existed answers with its order type, and that
  // is the server answering — so it outranks a held route too.
  it("reads a route from a side the server sent without one", () => {
    const merged = merge(
      { defaultPricing: { selling: { market: "hek", orderType: "sell" } } },
      chosen(),
    );

    expect(merged.defaultPricing.selling.exit).toBe("listed");
  });
});

// The settings endpoint replaces the whole document with what it is sent, so a
// field this client does not carry is not left alone — it is dropped, and with
// it every market the reader saved. Nothing reads the lane yet; carrying it
// through is the whole of what this stage owes.
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

  // A server that sent null, or a field that arrived as something else, must not
  // replace a list the client is holding on the reader's behalf.
  it("keeps what it holds when the answer is not a list", () => {
    const held = merge({ marketLocations: saved });

    expect(merge({ marketLocations: null }, held).marketLocations).toEqual(
      saved,
    );
  });
});
