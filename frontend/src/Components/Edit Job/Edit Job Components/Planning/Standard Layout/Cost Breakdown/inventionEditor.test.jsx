import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    account: { accountID: "acc-1", isLoggedIn: true },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const { default: InventionEditor, invitesInvention } =
  await import("./inventionEditor");
const { default: Job } = await import("../../../../../../Classes/job");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { draftFor } =
  await import("../../../../Edit Job Hooks/jobDraftStore.js");

const session = () => useUsersStore.getState().editSession;
/** The job as it stands after what the reader did. */
const jobNow = () => new Job(draftFor(session().draft, "job-1"));

const jobFor = (overrides = {}) =>
  new Job({ jobType: 1, name: "Item", itemID: 34, ...overrides });

const show = (job) => {
  session().actions.openJob("job-1", job.toDocument());
  render(<InventionEditor />);
};

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
});

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
    show(jobFor({ metaGroupID: 2 }));

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

    const changed = jobNow();
    expect(Object.keys(changed.build.inventionEntries)).toHaveLength(1);
    expect(Object.values(changed.build.inventionEntries)[0]).toMatchObject({
      itemName: "Datacore",
      itemCost: 1500,
    });
    // The same figure the cost breakdown counts.
    expect(changed.totalInventionCost).toBe(1500);
  });

  it("refuses an entry with no name", async () => {
    show(jobFor({ metaGroupID: 2 }));

    const cost = screen.getByPlaceholderText("0.00");
    await userEvent.clear(cost);
    await userEvent.type(cost, "1500");
    await userEvent.click(
      screen.getByRole("button", { name: "Add invention cost" }),
    );

    expect(session().draft.log).toEqual([]);
  });

  it("refuses an entry costing nothing", async () => {
    show(jobFor({ metaGroupID: 2 }));

    await userEvent.type(
      screen.getByPlaceholderText("What invention used…"),
      "Datacore",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add invention cost" }),
    );

    expect(session().draft.log).toEqual([]);
  });

  it("lists what has been recorded, and takes one back off", async () => {
    const job = jobFor({
      metaGroupID: 2,
      build: {
        inventionEntries: {
          1: { id: 1, itemName: "Datacore", itemCost: 1500 },
        },
      },
    });
    show(job);

    expect(screen.getByText("Datacore")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Datacore" }),
    );

    expect(jobNow().build.inventionEntries).toEqual({});
  });
});
