import { describe, expect, it } from "vitest";
import fs from "node:fs";
import { resolve } from "node:path";

import { MAX_BROKER_FEE_PERCENT } from "./newMarket";

// What the server holds a saved market lane to. Why this exists, and how to
// regenerate the fixture, are in
// services/shared/models/market_limits_parity_test.go.
const limits = JSON.parse(
  fs.readFileSync(
    resolve(process.cwd(), "../testing/fixtures/market-limits/limits.json"),
    "utf8",
  ),
);

describe("the limits a saved market is held to", () => {
  // The SPA stops a reader typing past the ceiling and the server refuses a lane
  // that breaks it. A ceiling only one side has moved fails silently: the field
  // either blocks a rate the server would now take, or lets one through that the
  // save is refused for, which a reader sees as a figure that never sticks.
  it("caps a broker fee where the server caps it", () => {
    expect(MAX_BROKER_FEE_PERCENT).toBe(limits.maxBrokerFeePercent);
  });
});
