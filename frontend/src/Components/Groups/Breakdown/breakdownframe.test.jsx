import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { figureFor } from "../../../tests/renderedFigure.js";

const group = { findOutputJobs: () => [] };

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    jobData: { actions: { getActiveGroupObject: () => group } },
  });
});

const { default: GroupBreakdownFrame } = await import("./breakdownframe.jsx");

/**
 * A job that bought what it names, and nothing else. Only the figures the
 * breakdown adds up are filled in.
 */
function jobBuying(purchases, extras = 0) {
  return {
    build: {
      setup: {},
      materials: {
        34: {
          typeID: 34,
          purchasing: Object.fromEntries(
            purchases.map(([itemCount, itemCost], index) => [
              `p${index}`,
              { id: `p${index}`, itemCount, itemCost },
            ]),
          ),
        },
      },
      extrasCosts: extras ? { e1: { id: "e1", extraValue: extras } } : {},
      inventionEntries: {},
    },
    esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  };
}

describe("what a group's jobs add up to", () => {
  // The totals are summed across the group's jobs, which is the one thing this
  // frame does. A job's own spend is read by a selector rather than held on it.
  it("adds up what every job in the group spent on materials", () => {
    render(
      <GroupBreakdownFrame
        groupJobs={[jobBuying([[10, 5]]), jobBuying([[20, 3]])]}
      />,
    );

    expect(figureFor("Total Bought Material Cost")).toBe(10 * 5 + 20 * 3);
  });

  it("adds up nothing for a group with no jobs", () => {
    render(<GroupBreakdownFrame groupJobs={[]} />);

    expect(figureFor("Total Bought Material Cost")).toBe(0);
  });
});
