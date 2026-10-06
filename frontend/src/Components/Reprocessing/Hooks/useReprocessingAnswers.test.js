import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  VELDSPAR,
  reprocessingFile,
} from "../../../tests/reprocessingFixtures.js";

const { pricing } = vi.hoisted(() => ({ pricing: { isLoading: true } }));

vi.mock("../../../Functions/Helper/getCachedData", async () => {
  const { cachedDataMock } = await import("../../../tests/cachedDataMock.js");
  return cachedDataMock({
    getReprocessingData: async () => reprocessingFile([VELDSPAR], {}),
    getFullItemList: async () => ({
      34: { type_id: 34, name: "Tritanium" },
      3828: { type_id: 3828, name: "Construction Blocks" },
    }),
  });
});

vi.mock("../../../Hooks/React Query/World/marketPrices.js", () => ({
  useMarketPricesQuery: () => ({
    isLoading: pricing.isLoading,
    refreshTimes: pricing.isLoading ? undefined : { "jita:34": 1 },
  }),
}));

const { primeReprocessing } =
  await import("../../../Functions/Static/reprocessing.js");
const { primeItems } = await import("../../../Functions/Static/items.js");
const { structureFromDocument } =
  await import("../../../Functions/Custom Structures/customStructure");
const { jobTypes, defaultPlannerReprocessingSettings } =
  await import("../../../Context/defaultValues");
const { reprocessingDirections } = await import("./reprocessingReducer");
const { useReprocessingAnswers } = await import("./useReprocessingAnswers.js");

function answersFor(paste) {
  const state = {
    direction: reprocessingDirections.fromMinerals,
    pastes: {
      [reprocessingDirections.toMinerals]: { text: "", committed: "" },
      [reprocessingDirections.fromMinerals]: { text: paste, committed: paste },
    },
    currentStructure: structureFromDocument(undefined, jobTypes.reprocessing),
    marketLocation: "jita",
    orderType: "sell",
  };
  return renderHook(() =>
    useReprocessingAnswers(
      state,
      defaultPlannerReprocessingSettings(),
      {},
      {
        feePercent: 5,
      },
    ),
  ).result.current;
}

beforeEach(async () => {
  pricing.isLoading = true;
  await Promise.all([primeReprocessing(), primeItems()]);
});

describe("From minerals while its prices are still coming", () => {
  it("already says what the paste read, and plans nothing yet", () => {
    const answers = answersFor(
      "Tritanium\t1000\nConstruction Blocks\t5\nNo Such Thing\t2",
    );

    expect(Object.keys(answers.requestedMinerals)).toEqual(["34"]);
    expect(answers.leftOut.map((line) => line.name)).toEqual([
      "Construction Blocks",
    ]);
    expect(answers.unread).toEqual(["No Such Thing\t2"]);
    expect(answers.reprocessingObjects).toEqual([]);
    expect(answers.isPricing).toBe(true);
  });
});
