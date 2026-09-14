import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resolve } from "node:path";

import GLOBAL_CONFIG from "./global-config-app";

// The markets this SPA offers, checked against the ones the server actually
// prices. Why this exists, and how to regenerate the fixture, are in
// services/shared/core/esi/locations_parity_test.go.
const { hubs } = JSON.parse(
  fs.readFileSync(
    resolve(process.cwd(), "../testing/fixtures/market-hubs/hubs.json"),
    "utf8",
  ),
);

const { MARKET_OPTIONS, DEFAULT_MARKET_OPTION } = GLOBAL_CONFIG;

describe("the markets the SPA offers", () => {
  // Sorted arrays rather than sets: a set cannot tell a duplicated entry from
  // the correct list, and a hub listed twice renders twice in the picker.
  it("is the set the server prices, no more and no less", () => {
    expect(MARKET_OPTIONS.map((option) => option.id).sort()).toEqual(
      Object.keys(hubs).sort(),
    );
  });

  // A wrong station prices against the wrong market while still naming the
  // right one, which is the failure a reader could not see.
  it("names each market the way the server does", () => {
    for (const option of MARKET_OPTIONS) {
      expect(option, `MARKET_OPTIONS entry ${option.id}`).toMatchObject(
        hubs[option.id],
      );
    }
  });

  // Order is not part of the agreement — the server lists Jita first and this
  // list is alphabetical because that is the order a reader picks from — but a
  // list that has stopped being sorted is a list someone edited by appending.
  it("stays in the order a reader reads", () => {
    const names = MARKET_OPTIONS.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  // The default is a choice among the markets, not a fifth one.
  it("defaults to a market it offers", () => {
    expect(Object.keys(hubs)).toContain(DEFAULT_MARKET_OPTION);
  });
});
