import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import LinkedESIJob from "../../../Classes/linkedESIJob";
import {
  finishesAt,
  isActive,
  isDelivered,
  isReadyToDeliver,
  progressPercent,
} from "./linkedRunSelectors";

/**
 * Each is checked against the getter or method on `LinkedESIJob` it replaces:
 * both read one run, and the answers are compared.
 */

const NOW = Date.parse("2026-06-01T12:00:00Z");
const hoursFromNow = (hours) =>
  new Date(NOW + hours * 3600 * 1000).toISOString();

const runs = {
  "half way through": {
    status: "active",
    start_date: hoursFromNow(-5),
    end_date: hoursFromNow(5),
  },
  "just started": {
    status: "active",
    start_date: hoursFromNow(-1),
    end_date: hoursFromNow(99),
  },
  "waiting to be delivered": {
    status: "active",
    start_date: hoursFromNow(-20),
    end_date: hoursFromNow(-1),
  },
  delivered: {
    status: "delivered",
    start_date: hoursFromNow(-20),
    end_date: hoursFromNow(-10),
  },
  cancelled: {
    status: "cancelled",
    start_date: hoursFromNow(-20),
    end_date: hoursFromNow(-10),
  },
  "with no end date": { status: "active", start_date: hoursFromNow(-5) },
  "with no dates at all": { status: "active" },
  "ending before it began": {
    status: "active",
    start_date: hoursFromNow(5),
    end_date: hoursFromNow(-5),
  },
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => vi.useRealTimers());

describe("what a linked run says about itself", () => {
  for (const [name, row] of Object.entries(runs)) {
    it(`agrees with the class for a run ${name}`, () => {
      const run = new LinkedESIJob(row);

      expect(isActive(row)).toBe(run.isActive);
      expect(isDelivered(row)).toBe(run.isDelivered);
      expect(finishesAt(row)).toBe(run.finishesAt);
      expect(isReadyToDeliver(row)).toBe(run.isReadyToDeliver);
      expect(progressPercent(row)).toBe(run.progressPercent());
    });
  }

  // The figures the bar is drawn from, rather than only agreement with a class
  // that could be wrong in the same way.
  it("reads a run half way through as half done", () => {
    expect(progressPercent(runs["half way through"])).toBe(50);
  });

  it("reads a delivered run as done and an unstarted one as nothing", () => {
    expect(progressPercent(runs.delivered)).toBe(100);
    expect(progressPercent(runs["with no dates at all"])).toBe(0);
    expect(progressPercent(undefined)).toBe(0);
  });
});
