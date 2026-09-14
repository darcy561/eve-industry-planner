import { beforeEach, describe, expect, it } from "vitest";
import {
  clockedSources,
  readAdjustedClock,
  readSourceClock,
  recordAdjustedClock,
  recordSourceClock,
  resetSourceClocks,
} from "./sourceClocks.js";

beforeEach(() => {
  resetSourceClocks();
});

describe("recording a market's clock", () => {
  it("holds nothing before a market has answered", () => {
    expect(readSourceClock("jita")).toBeUndefined();
    expect(clockedSources()).toEqual([]);
  });

  // The first clock is what the rows arriving with it are current as of, so
  // there is nothing older to make stale.
  it("records the first clock without calling it a move", () => {
    expect(recordSourceClock("jita", 1757000000000)).toBe(false);
    expect(readSourceClock("jita")).toBe(1757000000000);
  });

  // The whole rule: a market that has not been walked again is left alone.
  it("does not call the same clock a move", () => {
    recordSourceClock("jita", 1757000000000);

    expect(recordSourceClock("jita", 1757000000000)).toBe(false);
  });

  it("calls a newer clock a move and keeps it", () => {
    recordSourceClock("jita", 1757000000000);

    expect(recordSourceClock("jita", 1757003600000)).toBe(true);
    expect(readSourceClock("jita")).toBe(1757003600000);
  });

  // Two chunks of one request settle in whichever order they land, and a market
  // never walks backwards.
  it("ignores a clock older than the one held", () => {
    recordSourceClock("jita", 1757003600000);

    expect(recordSourceClock("jita", 1757000000000)).toBe(false);
    expect(readSourceClock("jita")).toBe(1757003600000);
  });

  it("keeps each market's clock apart", () => {
    recordSourceClock("jita", 1757000000000);
    recordSourceClock("amarr", 1757003600000);

    expect(readSourceClock("jita")).toBe(1757000000000);
    expect(readSourceClock("amarr")).toBe(1757003600000);
    expect(clockedSources().sort()).toEqual(["amarr", "jita"]);
  });

  // A market that answered with no clock at all must not be recorded as walked
  // at the epoch, which is what made a missing figure read as a real one before.
  it.each([[0], [undefined], [null], [NaN]])(
    "refuses %s as a clock",
    (value) => {
      expect(recordSourceClock("jita", value)).toBe(false);
      expect(readSourceClock("jita")).toBeUndefined();
    },
  );
});

describe("the adjusted block's clock", () => {
  it("is kept apart from every market", () => {
    recordAdjustedClock(1757000000000);

    expect(readAdjustedClock()).toBe(1757000000000);
    expect(clockedSources()).toEqual([]);
  });

  it("moves on its own", () => {
    recordAdjustedClock(1757000000000);

    expect(recordAdjustedClock(1757086400000)).toBe(true);
    expect(readAdjustedClock()).toBe(1757086400000);
  });
});
