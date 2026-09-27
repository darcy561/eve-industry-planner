import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { figureFor } from "../../../tests/renderedFigure.js";

const jobsForOutput = { current: [] };
const group = { getJobIDsForOutputJob: () => jobsForOutput.current };

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    jobData: { actions: { getActiveGroupObject: () => group } },
  });
});

const { default: ItemBreakdownFrame } = await import("./itemFrame.jsx");

function jobBuying(itemCount, itemCost) {
  return {
    build: {
      setup: {},
      materials: {
        34: {
          typeID: 34,
          purchasing: { p: { id: "p", itemCount, itemCost } },
        },
      },
      extrasCosts: {},
      inventionEntries: {},
    },
    esi: { industryJobs: {}, marketOrders: {}, transactions: {} },
  };
}

const outputJob = { jobID: "output", itemID: 587, name: "Rifter" };

describe("what one output job's tree adds up to", () => {
  it("adds up what every job feeding the output spent on materials", () => {
    jobsForOutput.current = [jobBuying(10, 5), jobBuying(20, 3)];

    render(<ItemBreakdownFrame outputJob={outputJob} />);

    expect(figureFor("Bought Material Cost")).toBe(10 * 5 + 20 * 3);
  });

  it("adds up nothing where nothing feeds the output", () => {
    jobsForOutput.current = [];

    render(<ItemBreakdownFrame outputJob={outputJob} />);

    expect(figureFor("Bought Material Cost")).toBe(0);
  });
});
