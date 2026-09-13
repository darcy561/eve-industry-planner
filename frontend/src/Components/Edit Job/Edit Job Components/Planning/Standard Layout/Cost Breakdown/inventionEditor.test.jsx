import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: { accountID: "acc-1", isLoggedIn: true },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const { default: InventionEditor, invitesInvention } =
  await import("./inventionEditor");
const { default: Job } = await import("../../../../../../Classes/job");

const jobFor = (overrides = {}) =>
  new Job({ jobType: 1, name: "Item", itemID: 34, ...overrides });

const show = (job) => {
  const actions = { updateActiveJob: vi.fn() };
  render(<InventionEditor state={{ activeJob: job }} actions={actions} />);
  return actions;
};

beforeEach(() => vi.clearAllMocks());

// Only a T2 or T3 item is invented, and the meta group is what says so. Reading
// it was broken for every job, so nothing was ever asked what invention cost.
describe("which items are asked about invention", () => {
  it.each([2, 14, 53])("asks a meta group %i item", (metaGroupID) => {
    expect(invitesInvention(jobFor({ metaGroupID }))).toBe(true);
  });

  it("does not ask a T1 item", () => {
    expect(invitesInvention(jobFor({ metaGroupID: 1 }))).toBe(false);
  });

  it("does not ask an item with no meta group at all", () => {
    expect(invitesInvention(jobFor())).toBe(false);
  });
});

describe("recording what invention cost", () => {
  it("says what belongs here before anything is recorded", () => {
    show(jobFor({ metaGroupID: 2 }));

    expect(screen.getByText(/Datacores, decryptors/)).toBeInTheDocument();
  });

  it("writes an entry onto the job, where Purchasing reads it too", async () => {
    const job = jobFor({ metaGroupID: 2 });
    const actions = show(job);

    await userEvent.type(
      screen.getByPlaceholderText("What invention used…"),
      "Datacore",
    );
    const cost = screen.getByPlaceholderText("0.00");
    await userEvent.clear(cost);
    await userEvent.type(cost, "1500");
    await userEvent.click(
      screen.getByRole("button", { name: "Add invention cost" }),
    );

    expect(job.build.costs.inventionEntries).toHaveLength(1);
    expect(job.build.costs.inventionEntries[0]).toMatchObject({
      itemName: "Datacore",
      itemCost: 1500,
    });
    // The same figure the cost breakdown counts.
    expect(job.totalInventionCost).toBe(1500);
    expect(actions.updateActiveJob).toHaveBeenCalled();
  });

  it("refuses an entry with no name", async () => {
    const job = jobFor({ metaGroupID: 2 });
    show(job);

    const cost = screen.getByPlaceholderText("0.00");
    await userEvent.clear(cost);
    await userEvent.type(cost, "1500");
    await userEvent.click(
      screen.getByRole("button", { name: "Add invention cost" }),
    );

    expect(job.build.costs.inventionEntries).toHaveLength(0);
  });

  it("refuses an entry costing nothing", async () => {
    const job = jobFor({ metaGroupID: 2 });
    show(job);

    await userEvent.type(
      screen.getByPlaceholderText("What invention used…"),
      "Datacore",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add invention cost" }),
    );

    expect(job.build.costs.inventionEntries).toHaveLength(0);
  });

  it("lists what has been recorded, and takes one back off", async () => {
    const job = jobFor({
      metaGroupID: 2,
      build: {
        costs: {
          inventionEntries: [{ id: 1, itemName: "Datacore", itemCost: 1500 }],
        },
      },
    });
    show(job);

    expect(screen.getByText("Datacore")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Datacore" }),
    );

    expect(job.build.costs.inventionEntries).toHaveLength(0);
  });
});
