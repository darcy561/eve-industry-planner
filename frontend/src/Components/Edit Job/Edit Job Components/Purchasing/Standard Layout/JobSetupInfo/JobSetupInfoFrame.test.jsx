import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";
import { setupFixture } from "../../../../../../tests/editJobFixtures.js";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: {
      actions: { findPredefinedSystemIndex: () => undefined },
    },
    worldData: {
      actions: { findSystemIndex: () => ({ manufacturing: 0.05 }) },
    },
  });
});

vi.mock("../../../../../../Hooks/useSolarSystemNames", () => ({
  useSolarSystemName: () => "Jita",
}));

const { default: JobSetupInfoFrame } = await import("./JobSetupInfoFrame.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;

const openJob = (setups = { "setup-1": setupFixture("setup-1") }) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemsProducedPerRun: 10,
    build: { setup: setups },
  });

const show = (Frame = JobSetupInfoFrame) =>
  render(
    <ThemeProvider theme={theme}>
      <Frame />
    </ThemeProvider>,
  );

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("what each of the job's setups will make", () => {
  // Runs times jobs times what one run makes: the figure the purchasing stage
  // is planned against.
  it("counts the output of each setup", () => {
    session().actions.closeSession();
    openJob({
      "setup-1": { ...setupFixture("setup-1"), runCount: 3, jobCount: 2 },
    });

    show();

    expect(screen.getByText("Quantity Planned: 60")).toBeInTheDocument();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("setupInfo", JobSetupInfoFrame));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("setupInfo")).toBe(0);
  });
});
