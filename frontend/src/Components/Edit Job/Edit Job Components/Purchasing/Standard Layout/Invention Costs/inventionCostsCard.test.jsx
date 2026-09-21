import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { InventionCostsCard } = await import("./inventionCostsCard.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { draftFor } =
  await import("../../../../Edit Job Hooks/jobDraftStore.js");

const session = () => useUsersStore.getState().editSession;
const job = () => draftFor(session().draft, "job-1");

const openJob = (inventionEntries = {}) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    itemID: 587,
    metaLevel: 2,
    build: { inventionEntries, extrasCosts: {} },
  });

const show = (Card = InventionCostsCard) => render(<Card />);

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
  openJob({
    one: { id: "one", itemName: "Datacore", itemCost: 1500 },
    two: { id: "two", itemName: "Decryptor", itemCost: 500 },
  });
});

describe("what invention cost, on the purchasing stage", () => {
  // The total is derived from the entries rather than stored beside them, so it
  // cannot fall behind one being added or taken off.
  it("totals what has been recorded", () => {
    show();

    expect(screen.getByText(/Total Cost: 2,000.00/)).toBeInTheDocument();
  });

  it("follows an entry being taken off", async () => {
    show();

    // The entries are chips; the one for this entry carries the delete control.
    await userEvent.click(
      screen
        .getByText(/Datacore/)
        .closest(".MuiChip-root")
        .querySelector(".MuiChip-deleteIcon"),
    );

    expect(Object.keys(job().build.inventionEntries)).toEqual(["two"]);
    expect(screen.getByText(/Total Cost: 500.00/)).toBeInTheDocument();
  });

  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    show(renders.watch("invention", InventionCostsCard));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "add extra cost",
        recipe: (held) => {
          held.build.extrasCosts = { "extra-1": { id: "extra-1", cost: 1 } };
        },
      });
    });

    expect(renders.of("invention")).toBe(0);
  });
});
