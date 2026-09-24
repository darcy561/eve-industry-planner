import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";
import { clear } from "idb-keyval";

import {
  deferMarket,
  replaceStoredPrices,
  resetPriceStore,
} from "../../../../Functions/MarketData/priceStore";
import { MARKET_READ_OUTCOME } from "../../../../Functions/MarketData/marketReadOutcome";
import { SOURCE_KIND } from "../../../../Functions/MarketData/marketSources";
import { summariseMarket } from "./marketSummary";
import { marketRow } from "./marketRows";

/**
 * From what a failed read wrote on the device to the sentence a reader sees.
 *
 * Every step of this has a test of its own, and each of those mocks its
 * neighbour: the rotation's tests mock the store, the summary's tests mock the
 * store, and the row and table tests build their input by hand. So nothing
 * proved that the value the store *writes* is the value the summary *reads* —
 * a renamed field would leave every one of those suites green while the panel
 * quietly stopped saying anything at all.
 *
 * The real modules throughout, over a fake IndexedDB.
 */

const citadel = {
  id: "saved-citadel",
  name: "Perimeter Azbel",
  kind: SOURCE_KIND.CITADEL,
  structureID: 1035466617946,
};

const sentenceFor = async (source) => marketRow(await summariseMarket(source));

beforeEach(async () => {
  // `resetPriceStore` only lets the once-per-session prune run again; what the
  // device holds has to be cleared separately, or a case reads the market the
  // one before it wrote.
  resetPriceStore();
  await clear();
});

describe("what a failed read leaves for the reader to see", () => {
  it("carries a refusal through to the words on the row", async () => {
    await deferMarket(citadel.id, 5000, MARKET_READ_OUTCOME.REFUSED);

    const row = await sentenceFor(citadel);

    expect(row.readOutcome).toBe(MARKET_READ_OUTCOME.REFUSED);
    expect(row.readProblem.label).toBe("No character can dock here");
  });

  it("carries having nobody to ask through as its own sentence", async () => {
    await deferMarket(citadel.id, 5000, MARKET_READ_OUTCOME.UNASKABLE);

    expect((await sentenceFor(citadel)).readProblem.label).toBe(
      "No character can be asked",
    );
  });

  // Prices arriving disprove whatever the last turn could not do, so the row
  // has to stop saying it — a reader who links a character that can dock would
  // otherwise go on being told to.
  it("stops saying it once the market reads", async () => {
    await deferMarket(citadel.id, 5000, MARKET_READ_OUTCOME.REFUSED);

    await replaceStoredPrices(
      citadel.id,
      new Map([[34, { sell: 10, buy: 8, refreshedAt: 1700 }]]),
      { refreshedAt: 1700, expiresAt: 9999 },
    );

    const row = await sentenceFor(citadel);

    expect(row.readOutcome).toBe(MARKET_READ_OUTCOME.READ);
    expect(row.readProblem).toBeUndefined();
    expect(row.lastReadAt).toBeGreaterThan(0);
  });

  // Asserted down to the absent moment and the absent outcome, not just the
  // absent sentence: a market read a moment ago also has no sentence, so the
  // weaker assertion would pass on a device that had not been cleared.
  it("says nothing about a market the device holds no record for", async () => {
    const row = await sentenceFor(citadel);

    expect(row.readOutcome).toBeUndefined();
    expect(row.lastReadAt).toBeUndefined();
    expect(row.readProblem).toBeUndefined();
    expect(row.readHere).toBe(true);
  });
});
