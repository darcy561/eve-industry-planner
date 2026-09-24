import { describe, expect, it } from "vitest";

import {
  MARKET_READ_OUTCOME,
  outcomeOfFailedRead,
  readerCanAct,
} from "./marketReadOutcome";
import { LocationResolutionError } from "../EveESI/World/locationOutcome";

// The three ways a read of the reader's own market ends without prices. They are
// told apart by what the error already carries rather than by its message, so
// the walk can reword itself without changing what a panel says.
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

  // A market called unreachable on a bad connection sends a reader off to fix
  // something that is not broken, so anything unmarked is read as a failure.
  it("reads an unmarked error as a failure rather than an answer", () => {
    const down = new LocationResolutionError("esi is unavailable", {
      status: 503,
    });

    expect(outcomeOfFailedRead(down)).toBe(MARKET_READ_OUTCOME.FAILED);
    expect(outcomeOfFailedRead(undefined)).toBe(MARKET_READ_OUTCOME.FAILED);
  });
});

// What separates something to tell the reader from something to keep quiet
// about: a failure is the app's problem or ESI's, and the next turn may answer
// without the reader having done anything at all.
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
