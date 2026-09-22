import { describe, expect, it, vi } from "vitest";
import { PricedSurface } from "../../../../../../tests/pricedSurface.jsx";
import { render, screen, fireEvent } from "@testing-library/react";
import { TRITANIUM } from "../../../../../../tests/editJobFixtures.js";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({ jobData: { jobArray: [] } });
});

const { MaterialCardFrame_Purchasing } =
  await import("./materialCardFrame.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

/** The job the card belongs to, as the session holds it. */
function jobNeeding(quantity, { materialJobType = 0, purchasing = {} } = {}) {
  const document = {
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
      materials: {
        [String(TRITANIUM)]: {
          typeID: TRITANIUM,
          name: "Tritanium",
          jobType: materialJobType,
          purchasing,
        },
      },
      childJobs: { [TRITANIUM]: [] },
    },
  };
  session().actions.closeSession();
  session().actions.openJob("job-1", document);
  return document;
}

function renderCard(job) {
  return render(
    <PricedSurface>
      <MaterialCardFrame_Purchasing material={job.build.materials[TRITANIUM]} />
    </PricedSurface>,
  );
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
    const job = jobNeeding(100, {
      purchasing: { a: { id: "a", itemCount: 120, itemCost: 5 } },
    });

    renderCard(job);

    expect(screen.getByText("20 extra")).toBeInTheDocument();
  });
});
