import { describe, expect, it } from "vitest";

import {
  marketRow,
  placeLabel,
  readProblem,
  sharedByLabel,
} from "./marketRows";
import { MARKET_READ_OUTCOME } from "../../../../Functions/MarketData/registry/marketReadOutcome.js";

const summary = {
  id: "market-1",
  name: "Perimeter Azbel",
  kind: "citadel",
  lastReadAt: undefined,
  readHere: true,
  brokerFee: 2.5,
};

describe("who shared a market", () => {
  // The kind rather than the name: an owner key carries an entity reference,
  // and naming the corporation costs a round trip this panel does not need.
  it("places the reader in the organisation it came from", () => {
    expect(sharedByLabel("corporation:abc")).toBe("Your corporation");
    expect(sharedByLabel("alliance:def")).toBe("Your alliance");
    expect(sharedByLabel("planner:ghi")).toBe("A planner");
  });

  it("says nothing for a market the reader saved themselves", () => {
    expect(sharedByLabel(undefined)).toBeUndefined();
    expect(sharedByLabel("")).toBeUndefined();
  });

  // An owner kind this build does not know is not "the reader's own": saying so
  // would offer a market to edit that they cannot.
  it("says nothing for an owner kind it does not know", () => {
    expect(sharedByLabel("guild:jkl")).toBeUndefined();
  });
});

describe("what sort of place a market is", () => {
  // The kind, decided once where a market becomes a source, rather than each
  // reader testing a field for itself.
  it("follows the market's kind", () => {
    expect(placeLabel("citadel")).toBe("Citadel");
    expect(placeLabel("station")).toBe("NPC station");
    expect(placeLabel(undefined)).toBe("NPC station");
  });
});

describe("a market as the table draws it", () => {
  it("says how long ago it was read", () => {
    const row = marketRow(
      { ...summary, lastReadAt: 1000 },
      { now: 1000 + 20 * 60 * 1000 },
    );

    expect(row.lastReadLabel).toMatch(/20 minutes ago/);
  });

  // The table writes its own sentence for an absent moment, and a formatter
  // handed nothing returns an empty string rather than a misleading "now".
  it("gives no wording where there is no moment", () => {
    expect(marketRow(summary).lastReadLabel).toBe("");
  });

  // Whether a market can be changed depends on settings still arriving as the
  // panel draws, so a row does not carry an answer that would be fixed at the
  // moment it was summarised.
  it("carries who shared it rather than whether it can be changed", () => {
    const inherited = marketRow({ ...summary, sharedBy: "corporation:abc" });

    expect(inherited.sharedBy).toBe("corporation:abc");
    expect(inherited.editable).toBeUndefined();
  });
});

// The row carries how the last read went but says nothing about it: what a
// reader is told, and what they are offered to fix it, is the panel's to decide.
describe("a row's record of how the market last read", () => {
  it("carries what the summary settled on", () => {
    const row = marketRow({ id: "m", name: "M", readOutcome: "refused" });

    expect(row.readOutcome).toBe("refused");
  });

  it("carries nothing where the summary had nothing", () => {
    expect(marketRow({ id: "m", name: "M" }).readOutcome).toBeUndefined();
  });
});

// Only what a reader can act on is worded. A read that failed is ESI's problem
// and may answer next turn; a market nothing has read yet is not a fault.
describe("wording why a market's prices are not arriving", () => {
  it("names being refused, and says what to do about it", () => {
    const problem = readProblem(MARKET_READ_OUTCOME.REFUSED);

    expect(problem.label).toBe("No character can dock here");
    expect(problem.explain).toMatch(/dock there/i);
  });

  it("tells having nobody to ask apart from being told no", () => {
    expect(readProblem(MARKET_READ_OUTCOME.UNASKABLE).label).toBe(
      "No character can be asked",
    );
  });

  // Saying this would send a reader off to fix something that is not broken.
  it("says nothing about a read that merely failed", () => {
    expect(readProblem(MARKET_READ_OUTCOME.FAILED)).toBeUndefined();
  });

  it("says nothing about a market that read, or has no record", () => {
    expect(readProblem(MARKET_READ_OUTCOME.READ)).toBeUndefined();
    expect(readProblem(undefined)).toBeUndefined();
  });

  it("puts it on the row it belongs to", () => {
    const row = marketRow({
      id: "m",
      name: "M",
      readOutcome: MARKET_READ_OUTCOME.REFUSED,
    });

    expect(row.readProblem.label).toBe("No character can dock here");
  });
});
