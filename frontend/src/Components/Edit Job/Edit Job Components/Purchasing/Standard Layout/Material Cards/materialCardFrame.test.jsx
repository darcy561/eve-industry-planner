import { beforeEach, describe, expect, it, vi } from "vitest";
import { PricedSurface } from "../../../../../../tests/pricedSurface.jsx";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    jobData: { jobArray: [] },
    applicationSettings: { actions: { checkTypeIDisExempt: () => false } },
  });
});

vi.mock("../../../../../../Hooks/EveEsi/useLocationNames", () => ({
  default: () => ({ names: {} }),
}));

const { MaterialCardFrame_Purchasing } =
  await import("./materialCardFrame.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;

const TRITANIUM = 34;

/** A material row as the job stores one: purchases, and no derived figures. */
const material = {
  typeID: TRITANIUM,
  name: "Tritanium",
  purchasing: {},
};

const openJob = () =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    includedInGroup: false,
    build: {
      // The setup is what says the job needs a hundred of it.
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: { [TRITANIUM]: { typeID: TRITANIUM, quantity: 100 } },
        },
      },
      materials: { [TRITANIUM]: material },
      childJobs: { [TRITANIUM]: [] },
      extrasCosts: {},
    },
  });

const show = (Card = MaterialCardFrame_Purchasing) =>
  render(
    <PricedSurface>
      <ThemeProvider theme={theme}>
        <Card material={material} />
      </ThemeProvider>
    </PricedSurface>,
  );

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("a material's card on the purchasing stage", () => {
  it("names the material it is for, and what the job still needs", () => {
    show();

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(screen.getByText(/Total Needed: 100/)).toBeInTheDocument();
  });

  // It reads this material's links and what is stored for it, so a change
  // anywhere else in the job is not its business.
  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("card", MaterialCardFrame_Purchasing));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("card")).toBe(0);
  });

  // A child job linked under another material is another card's business.
  it("is not re-rendered by a link taken on elsewhere", async () => {
    const renders = renderCounts();
    show(renders.watch("card", MaterialCardFrame_Purchasing));
    renders.reset();

    await act(async () => {
      session().actions.markChildJobsForAddition([
        { jobID: "job-9", itemID: 999 },
      ]);
    });

    expect(renders.of("card")).toBe(0);
  });
});
