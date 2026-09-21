import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
    account: {
      actions: {
        findCharacterByHash: () => ({
          CharacterID: 1,
          CharacterName: "Seller",
          corporation_id: 2,
        }),
        getCorporation: () => ({ corporation_id: 2, name: "Corp" }),
      },
    },
  });
});

vi.mock("../../../../Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => false,
}));

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const { LinkedTransactionPanel } = await import("./linkedTransactionPanel.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

/** One sale, as the job stores it. */
const sale = (transaction_id, date) => ({
  transaction_id,
  date,
  description: `Sale ${transaction_id}`,
  quantity: 5,
  unit_price: 100,
  amount: 500,
  tax: 10,
  CharacterHash: "hash-1",
  is_corp: false,
});

const jobDocument = (transactions = {}) => ({
  jobID: "job-1",
  itemID: 34,
  parentJobs: [],
  layout: { setupToEdit: "setup0" },
  build: { materials: {}, childJobs: {}, setup: {} },
  esi: { industryJobs: {}, marketOrders: {}, transactions },
});

const show = (document = jobDocument(), Panel = LinkedTransactionPanel) => {
  session().actions.openJob(document.jobID, document);
  return render(<Panel />);
};

beforeEach(() => {
  session().actions.closeSession();
});

describe("the sales linked to a job", () => {
  it("says so when nothing is linked", () => {
    show();

    expect(
      screen.getByText(/no transactions linked to this market order/),
    ).toBeInTheDocument();
  });

  // Newest first: a player reading what a job sold for wants the last sale, not
  // the order the ids happen to key the map in.
  it("lists the sales newest first", () => {
    show(
      jobDocument({
        1: sale(1, "2026-05-01T12:00:00Z"),
        2: sale(2, "2026-06-01T12:00:00Z"),
      }),
    );

    const descriptions = screen
      .getAllByText(/^Sale \d$/)
      .map((node) => node.textContent);
    expect(descriptions).toEqual(["Sale 2", "Sale 1"]);
  });

  it("takes a sale off the job and remembers it to unlink", async () => {
    show(jobDocument({ 1: sale(1, "2026-05-01T12:00:00Z") }));

    await userEvent.click(screen.getByTestId("ClearIcon").closest("button"));

    expect(screen.getByText(/no transactions linked/)).toBeInTheDocument();
    expect(session().esiDataToLink.transactions.remove).toContain(1);
  });
});

// The panel reads the job's sales. What the job is built from is not one of
// them.
it("is not re-rendered by a change none of its figures are over", async () => {
  const renders = renderCounts();
  show(jobDocument(), renders.watch("sales", LinkedTransactionPanel));
  renders.reset();

  await act(async () => {
    session().actions.run({
      name: "add an extra cost",
      recipe: (job) => {
        job.build.extrasCosts = { e: { id: "e", extraValue: 50 } };
      },
    });
  });

  expect(renders.of("sales")).toBe(0);
});
