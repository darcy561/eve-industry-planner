import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { addNewJobsToPlanner, showBlueprintArchiveDialogue } = vi.hoisted(
  () => ({
    addNewJobsToPlanner: vi.fn(),
    showBlueprintArchiveDialogue: vi.fn(),
  }),
);

vi.mock("../../Functions/JobPlanner/addNewJobsToPlanner", () => ({
  default: addNewJobsToPlanner,
}));

vi.mock("../../Events/dialogueEvents", () => ({
  showBlueprintArchiveDialogue,
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("@sentry/react", () => ({ captureException: vi.fn() }));

import BlueprintGroupActions from "./blueprintGroupActions";
import { snackbarSpies } from "../../tests/snackbarHarness.js";

const { showSnackbarError } = snackbarSpies;

const BP_DATA = { itemID: 587, name: "Rifter" };

function renderActions(bpData = BP_DATA) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BlueprintGroupActions bpData={bpData} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  addNewJobsToPlanner.mockReset().mockResolvedValue(undefined);
  showBlueprintArchiveDialogue.mockReset();
  showSnackbarError.mockReset();
});

describe("a blueprint group's actions", () => {
  it("builds the item the blueprint makes", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: /Create job/ }));

    expect(addNewJobsToPlanner).toHaveBeenCalledWith(
      [{ itemID: 587 }],
      expect.anything(),
    );
  });

  it("opens the archive on the same item", async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole("button", { name: /Archived jobs/ }));

    expect(showBlueprintArchiveDialogue).toHaveBeenCalledWith(587, "Rifter");
  });

  // A build that throws used to leave the spinner up for as long as the page stayed open, and the
  // group could not be built again.
  it("says so and offers the build again when one fails", async () => {
    const user = userEvent.setup();
    addNewJobsToPlanner.mockRejectedValue(new Error("save refused"));
    renderActions();

    await user.click(screen.getByRole("button", { name: /Create job/ }));

    await waitFor(() => expect(showSnackbarError).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Create job/ }).disabled).toBe(
      false,
    );
  });

  it("offers nothing to act on for a blueprint the static data does not name", () => {
    renderActions(null);

    expect(screen.getByRole("button", { name: /Create job/ }).disabled).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: /Archived jobs/ }).disabled).toBe(
      true,
    );
  });
});
