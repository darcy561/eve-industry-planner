import { describe, expect, it } from "vitest";
import { hasLapsed, withFreshness } from "./priceFreshness.js";

describe("whether a price has stopped standing", () => {
  it("has once its moment has passed", () => {
    expect(hasLapsed(2000, 2001)).toBe(true);
  });

  it("has not right up to it", () => {
    expect(hasLapsed(2000, 1999)).toBe(false);
  });

  // The rule the four call sites disagreed on. A price is kept because
  // something said it was good, and nothing saying when it stops is not the
  // same as it having stopped — read the other way, a market with no stated
  // expiry is read again on every pass for want of a header.
  it.each([[undefined], [null], [NaN], ["soon"]])(
    "has not where the expiry is %s",
    (expiresAt) => {
      expect(hasLapsed(expiresAt, 9e12)).toBe(false);
    },
  );
});

describe("stamping a row with what it was read against", () => {
  it("carries both moments where both are known", () => {
    expect(
      withFreshness({ sell: 10 }, { refreshedAt: 1, expiresAt: 2 }),
    ).toEqual({ sell: 10, refreshedAt: 1, expiresAt: 2 });
  });

  // Absent, not present and meaningless: a row carrying `expiresAt: undefined`
  // reads as lapsed to anything comparing it raw.
  it.each([[undefined], [null], [NaN]])(
    "leaves the expiry out where it is %s",
    (expiresAt) => {
      const row = withFreshness({ sell: 10 }, { refreshedAt: 1, expiresAt });

      expect("expiresAt" in row).toBe(false);
      expect(row.refreshedAt).toBe(1);
    },
  );

  it("does not change the row it was given", () => {
    const row = { sell: 10 };

    withFreshness(row, { refreshedAt: 1, expiresAt: 2 });

    expect(row).toEqual({ sell: 10 });
  });
});
