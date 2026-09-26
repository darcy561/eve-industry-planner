import { describe, expect, it } from "vitest";

import {
  MARKET_READ_OUTCOME,
  outcomeOfFailedRead,
  readerCanAct,
} from "./marketReadOutcome";
import { LocationResolutionError } from "../../EveESI/World/locationOutcome";

describe("what a failed read settled on", () => {
  it("reads a refusal off the flag that marks asking again as waste", () => {
    const refused = new LocationResolutionError("no character can see it", {
      permanent: true,
    });

    expect(outcomeOfFailedRead(refused)).toBe(MARKET_READ_OUTCOME.REFUSED);
  });

  it("tells having nobody to ask with apart from being told no", () => {
    const unaskable = new LocationResolutionError("none is authorised to ask", {
      needsReauthorisation: true,
    });

    expect(outcomeOfFailedRead(unaskable)).toBe(MARKET_READ_OUTCOME.UNASKABLE);
  });

  it("reads an unmarked error as a failure rather than an answer", () => {
    const down = new LocationResolutionError("esi is unavailable", {
      status: 503,
    });

    expect(outcomeOfFailedRead(down)).toBe(MARKET_READ_OUTCOME.FAILED);
    expect(outcomeOfFailedRead(undefined)).toBe(MARKET_READ_OUTCOME.FAILED);
  });
});

describe("whether the reader can act on it", () => {
  it("says so for the outcomes a reader fixes", () => {
    expect(readerCanAct(MARKET_READ_OUTCOME.REFUSED)).toBe(true);
    expect(readerCanAct(MARKET_READ_OUTCOME.UNASKABLE)).toBe(true);
  });

  it("says not for a read that worked, failed, or never happened", () => {
    expect(readerCanAct(MARKET_READ_OUTCOME.READ)).toBe(false);
    expect(readerCanAct(MARKET_READ_OUTCOME.FAILED)).toBe(false);
    expect(readerCanAct(undefined)).toBe(false);
  });
});
