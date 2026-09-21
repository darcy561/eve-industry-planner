import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession();
});

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));

vi.mock("./jobSetupCard", () => ({
  JobSetupCard: ({ setupEntry }) => <span>{setupEntry.id}</span>,
}));

const { JobSetupPanel } = await import("./jobSetups.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const theme = createTheme();
const session = () => useUsersStore.getState().editSession;

const openJob = () =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    build: {
      setup: { "setup-1": { id: "setup-1" } },
      materials: {},
    },
    layout: {},
  });

const show = (Panel = JobSetupPanel) =>
  render(
    <ThemeProvider theme={theme}>
      <Panel />
    </ThemeProvider>,
  );

beforeEach(() => {
  session().actions.closeSession();
  openJob();
});

describe("the setups a job is built from", () => {
  it("draws a card for each", () => {
    show();

    expect(screen.getByText("setup-1")).toBeInTheDocument();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("setups", JobSetupPanel));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (job) => {
          job.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("setups")).toBe(0);
  });

  it("follows a setup being added", async () => {
    show();

    await act(async () => {
      session().actions.run({
        name: "add a setup",
        recipe: (job) => {
          job.build.setup["setup-2"] = { id: "setup-2" };
        },
      });
    });

    expect(screen.getByText("setup-2")).toBeInTheDocument();
  });
});
