import { describe, expect, it } from "vitest";
import { until } from "./crossClientHarness.js";

// A wait that gives up is where a cross-client scenario is debugged from, so
// what it says is the whole of its value. The lazy form exists because the
// per-client wait can only name what it saw once the waiting is over.
describe("waiting for a client", () => {
  it("says what it was waiting for", async () => {
    await expect(until(() => false, "the job to arrive", 30)).rejects.toThrow(
      "timed out waiting for the job to arrive",
    );
  });

  it("asks a lazy message for its wording at the moment it gives up", async () => {
    let seen = "nothing";
    const waiting = until(
      () => {
        seen = "a job with no group";
        return false;
      },
      () => `the job to be released; it was ${seen}`,
      30,
    );

    await expect(waiting).rejects.toThrow(
      "timed out waiting for the job to be released; it was a job with no group",
    );
  });

  it("stops as soon as the predicate is satisfied", async () => {
    let polls = 0;
    await until(() => ++polls >= 2, "two polls", 1000);

    expect(polls).toBe(2);
  });
});
