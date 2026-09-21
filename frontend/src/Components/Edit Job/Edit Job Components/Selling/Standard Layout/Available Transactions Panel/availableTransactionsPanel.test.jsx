import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const offered = { rows: [] };
const askedWith = { last: null };

// Stood in for, so the test proves what the panel hands it and what it does
// with the answer. What it matches is covered where it lives.
vi.mock(
  "../../../../../../Functions/MarketOrders/findOrderTransactions",
  () => ({
    default: (esi) => {
      askedWith.last = esi;
      return offered.rows;
    },
  }),
);

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

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  QueryClient: class {},
}));

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

const esiHooks = {
  "Character/useGetAllCharacterTransactions": "default",
  "Corporation/useGetAllCorporationTransactions":
    "useGetAllCorporationTransactions",
  "Character/useGetAllCharacterJournal": "useGetAllCharacterJournal",
  "Corporation/useGetAllCorporationJournal": "useGetAllCorporationJournal",
  "Character/useGetAllCharacterMarketOrders": "useGetAllCharacterMarketOrders",
  "Character/useGetAllCharacterHistoricMarketOrders":
    "useGetAllCharacterHistoricMarketOrders",
  "Corporation/useGetAllCorporationMarketOrders":
    "useGetAllCorporationMarketOrders",
  "Corporation/useGetAllCorporationHistoricMarketOrders":
    "useGetAllCorporationHistoricMarketOrders",
};

for (const [path, name] of Object.entries(esiHooks)) {
  vi.doMock(`../../../../../../Hooks/EveEsi/${path}`, () => ({
    [name]: () => ({ data: {}, isLoading: false, isError: false }),
  }));
}

const { AvailableTransactionsPanel } =
  await import("./availableTransactionsPanel.jsx");
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");

const session = () => useUsersStore.getState().editSession;

/** A sale the account holds that this job's order could be linked to. */
const sale = (transaction_id) => ({
  transaction_id,
  date: "2026-06-01T12:00:00Z",
  description: `Sale ${transaction_id}`,
  quantity: 5,
  unit_price: 100,
  amount: 500,
  tax: 10,
  CharacterHash: "hash-1",
  is_corp: false,
});

const jobDocument = ({ marketOrders = { 900: { order_id: 900 } } } = {}) => ({
  jobID: "job-1",
  itemID: 34,
  parentJobs: [],
  layout: { setupToEdit: "setup0" },
  build: { materials: {}, childJobs: {}, setup: {} },
  esi: { industryJobs: {}, marketOrders, transactions: {} },
});

const show = (document = jobDocument(), Panel = AvailableTransactionsPanel) => {
  session().actions.openJob(document.jobID, document);
  return render(<Panel isLoading={false} isError={false} />);
};

beforeEach(() => {
  offered.rows = [];
  askedWith.last = null;
  session().actions.closeSession();
});

describe("the sales a job could still link", () => {
  it("says so when the account holds none", () => {
    show();

    expect(
      screen.getByText(/no new transactions matching your order/),
    ).toBeInTheDocument();
  });

  // The matching is done against the job's own orders and the sales it already
  // holds — both read off the document rather than a class built over it.
  it("asks against the job's orders and the sales it already holds", () => {
    show();

    expect(askedWith.last).toEqual({
      marketOrders: { 900: { order_id: 900 } },
      transactions: {},
    });
  });

  it("puts an offered sale on the job and remembers it to save", async () => {
    offered.rows = [sale(1)];
    show();

    await userEvent.click(screen.getByTestId("AddIcon").closest("button"));

    expect(session().esiDataToLink.transactions.add).toContain(1);
  });

  it("offers to link every one of them at once", () => {
    offered.rows = [sale(1), sale(2)];
    show();

    expect(screen.getByRole("button", { name: /Link All/i })).toBeEnabled();
  });
});

// The panel reads the job's orders and its linked sales. What the job is built
// from is neither.
it("is not re-rendered by a change none of its figures are over", async () => {
  const renders = renderCounts();
  show(jobDocument(), renders.watch("available", AvailableTransactionsPanel));
  renders.reset();

  await act(async () => {
    session().actions.run({
      name: "add an extra cost",
      recipe: (job) => {
        job.build.extrasCosts = { e: { id: "e", extraValue: 50 } };
      },
    });
  });

  expect(renders.of("available")).toBe(0);
});
