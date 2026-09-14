import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TRITANIUM } from "../tests/editJobFixtures.js";

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
  documentLock: { scopes: {} },
};

vi.mock("../Zustand/usersStore.js", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

const { MaterialCardFrame_Purchasing } =
  await import("../Components/Edit Job/Edit Job Components/Purchasing/Standard Layout/Material Cards/materialCardFrame.jsx");
const { default: Job } = await import("./job.js");

function jobNeeding(quantity, { materialJobType = 0 } = {}) {
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
      materials: [
        { typeID: TRITANIUM, name: "Tritanium", jobType: materialJobType },
      ],
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

  // The dialogue behind the child-jobs count reads every job on the planner,
  // and a job carries one card per material, so it is not built until a reader
  // opens it.
  it("does not build the child jobs dialogue until it is opened", () => {
    renderCard(jobNeeding(100, { materialJobType: 1 }));
    expect(screen.queryByText("Available Child Jobs")).toBeNull();

    fireEvent.click(
      screen.getByLabelText(/number of child jobs linked/i).firstChild,
    );

    expect(screen.getByText("Available Child Jobs")).toBeInTheDocument();
  });

  it("says how many were bought beyond the requirement", () => {
    const job = jobNeeding(100);
    job.importPurchaseToMaterial(
      TRITANIUM,
      { itemCount: 120, itemCost: 5 },
      { recordExcess: true },
    );

    renderCard(job);

    expect(screen.getByText("20 extra")).toBeInTheDocument();
  });
});
