import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  finishesAt,
  isActive,
  isDelivered,
  isReadyToDeliver,
  progressPercent,
} from "./linkedRunSelectors";

/**
 * Each run states what it is expected to say about itself, so a case still
 * proves the figure when whatever used to answer for a run has gone.
 */

const NOW = Date.parse("2026-06-01T12:00:00Z");
const hoursFromNow = (hours) =>
  new Date(NOW + hours * 3600 * 1000).toISOString();

const cases = [
  {
    name: "half way through",
    run: {
      status: "active",
      start_date: hoursFromNow(-5),
      end_date: hoursFromNow(5),
    },
    active: true,
    delivered: false,
    finishes: 5,
    ready: false,
    progress: 50,
  },
  {
    name: "one hour into a hundred",
    run: {
      status: "active",
      start_date: hoursFromNow(-1),
      end_date: hoursFromNow(99),
    },
    active: true,
    delivered: false,
    finishes: 99,
    ready: false,
    progress: 1,
  },
  {
    name: "past its end date and waiting to be delivered",
    run: {
      status: "active",
      start_date: hoursFromNow(-20),
      end_date: hoursFromNow(-1),
    },
    active: true,
    delivered: false,
    finishes: -1,
    ready: true,
    progress: 100,
  },
  {
    name: "delivered",
    run: {
      status: "delivered",
      start_date: hoursFromNow(-20),
      end_date: hoursFromNow(-10),
    },
    active: false,
    delivered: true,
    finishes: -10,
    ready: false,
    progress: 100,
  },
  {
    name: "cancelled after its end date",
    run: {
      status: "cancelled",
      start_date: hoursFromNow(-20),
      end_date: hoursFromNow(-10),
    },
    active: false,
    delivered: false,
    finishes: -10,
    ready: false,
    progress: 100,
  },
  {
    name: "running with no end date",
    run: { status: "active", start_date: hoursFromNow(-5) },
    active: true,
    delivered: false,
    finishes: null,
    ready: false,
    progress: 0,
  },
  {
    name: "carrying no dates at all",
    run: { status: "active" },
    active: true,
    delivered: false,
    finishes: null,
    ready: false,
    progress: 0,
  },
  {
    name: "ending before it began",
    run: {
      status: "active",
      start_date: hoursFromNow(5),
      end_date: hoursFromNow(-5),
    },
    active: true,
    delivered: false,
    finishes: -5,
    ready: true,
    progress: 100,
  },
];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("what a linked run says about itself", () => {
  for (const expected of cases) {
    it(`reads a run ${expected.name}`, () => {
      const { run } = expected;

      expect(isActive(run)).toBe(expected.active);
      expect(isDelivered(run)).toBe(expected.delivered);
      expect(finishesAt(run)).toBe(
        expected.finishes === null
          ? null
          : NOW + expected.finishes * 3600 * 1000,
      );
      expect(isReadyToDeliver(run)).toBe(expected.ready);
      expect(progressPercent(run)).toBe(expected.progress);
    });
  }

  it("answers for nothing at all rather than throwing", () => {
    expect(isActive(undefined)).toBe(false);
    expect(finishesAt(undefined)).toBeNull();
    expect(isReadyToDeliver(undefined)).toBe(false);
    expect(progressPercent(undefined)).toBe(0);
  });

  it("takes the moment from the caller rather than the clock", () => {
    const run = cases[0].run;
    expect(progressPercent(run, NOW + 2.5 * 3600 * 1000)).toBe(75);
    expect(isReadyToDeliver(run, NOW + 6 * 3600 * 1000)).toBe(true);
  });
});
