import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const store = {
  account: {
    accountID: "acc-1",
    isLoggedIn: false,
    actions: { findCharacterByHash: () => null, findCharacterById: () => null },
  },
  jobData: {
    jobArray: [],
    actions: { findJobInJobArray: () => null },
  },
  applicationSettings: {
    actions: { getCurrentLocale: () => "en-GB" },
  },
  worldData: {
    actions: {
      findMarketData: () => ({ jita: { sell: 5, buy: 4 } }),
      findUniverseData: () => null,
    },
  },
  documentLock: { scopes: {} },
};

vi.mock("../src/Zustand/usersStore.js", () => {
  const useUsersStore = (selector) =>
    typeof selector === "function" ? selector(store) : store;
  useUsersStore.getState = () => store;
  return { default: useUsersStore };
});

const { MaterialCardFrame_Purchasing } = await import(
  "../src/Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/materialCardFrame.jsx"
);
const { default: Job } = await import("../src/Classes/job.js");

const TRITANIUM = 34;

function jobNeeding(quantity) {
  return new Job({
    jobID: "job-1",
    itemID: 587,
    jobType: 1,
    itemsProducedPerRun: 10,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity } },
        },
      },
      materials: [{ typeID: TRITANIUM, name: "Tritanium", jobType: 0 }],
      childJobs: { [TRITANIUM]: [] },
    },
  });
}

function renderCard(job) {
  const props = {
    state: {
      activeJob: job,
      temporaryChildJobs: {},
      parentChildToEdit: { childJobs: {} },
    },
    actions: { updateActiveJob: vi.fn() },
    material: job.build.materials[0],
  };
  return render(<MaterialCardFrame_Purchasing {...props} />);
}

// The card is where every material figure is read together, so rendering it is
// what catches a piece of that reading being unavailable.
describe("a material card", () => {
  it("shows what the job needs", () => {
    renderCard(jobNeeding(100));

    expect(screen.getByText(/Total Needed: 100/)).toBeInTheDocument();
  });

  it("says how many were bought beyond the requirement", () => {
    const job = jobNeeding(100);
    job.importPurchaseToMaterial(
      TRITANIUM,
      { itemCount: 120, itemCost: 5 },
      { recordExcess: true }
    );

    renderCard(job);

    expect(screen.getByText("20 extra")).toBeInTheDocument();
  });
});
