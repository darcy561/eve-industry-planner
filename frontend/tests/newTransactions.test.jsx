import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const characterOrders = { data: {}, isLoading: false, isError: false };
const corporationOrders = { data: {}, isLoading: false, isError: false };
const emptyQuery = { data: {}, isLoading: false, isError: false };
const characterTransactions = { data: {} };
const characterJournal = { data: {} };
const linkedOrders = new Set();
const linkedTrans = new Set();
const store = {
  jobData: { jobArray: [] },
  account: { linkedOrders, linkedTrans },
  applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
};

vi.mock("../src/Zustand/usersStore", () => ({
  default: Object.assign(
    (selector) => selector(store),
    { getState: () => store },
  ),
}));
vi.mock("../src/Hooks/EveEsi/Character/useGetAllCharacterMarketOrders", () => ({
  useGetAllCharacterMarketOrders: () => characterOrders,
  getAllCachedCharacterMarketOrders: () => characterOrders,
}));
vi.mock(
  "../src/Hooks/EveEsi/Character/useGetAllCharacterHistoricMarketOrders",
  () => ({
    useGetAllCharacterHistoricMarketOrders: () => emptyQuery,
    getAllCachedCharacterHistoricMarketOrders: () => emptyQuery,
  }),
);
vi.mock("../src/Hooks/EveEsi/Corporation/useGetAllCorporationMarketOrders", () => ({
  useGetAllCorporationMarketOrders: () => corporationOrders,
  getAllCachedCorporationMarketOrders: () => corporationOrders,
}));
vi.mock(
  "../src/Hooks/EveEsi/Corporation/useGetAllCorporationHistoricMarketOrders",
  () => ({
    useGetAllCorporationHistoricMarketOrders: () => emptyQuery,
    getAllCachedCorporationHistoricMarketOrders: () => emptyQuery,
  }),
);
vi.mock("../src/Hooks/EveEsi/Character/useGetAllCharacterJournal", () => ({
  useGetAllCharacterJournal: () => emptyQuery,
  getAllCachedCharacterJournal: () => characterJournal,
}));
vi.mock("../src/Hooks/EveEsi/Corporation/useGetAllCorporationJournal", () => ({
  useGetAllCorporationJournal: () => emptyQuery,
  getAllCachedCorporationJournal: () => ({ data: {} }),
}));
vi.mock("../src/Hooks/EveEsi/Character/useGetAllCharacterTransactions", () => ({
  getAllCachedCharacterTransactions: () => characterTransactions,
}));
vi.mock("../src/Hooks/EveEsi/Corporation/useGetAllCorporationTransactions", () => ({
  getAllCachedCorporationTransactions: () => ({ data: {} }),
}));
vi.mock("../src/Hooks/App/useCachedData", () => ({
  useCachedData: () => ({ data: [{ itemID: 34, name: "Tritanium" }] }),
}));

const { NewTransactions } = await import(
  "../src/Components/Dashboard/Components/NewTransactions.jsx"
);
const { LAST_JOB_STATUS_ID } = await import("../src/Context/defaultValues");

const SOLD_AT = "2026-08-01T12:00:00Z";
const ORDER = { order_id: 900, type_id: 34, location_id: 60003760 };

function journalFor(id, { withTax = true } = {}) {
  const entries = [
    {
      id: id * 10,
      ref_type: "market_transaction",
      context_id_type: "market_transaction_id",
      context_id: id,
      amount: 50,
      description: "Market: Tritanium bought",
      date: SOLD_AT,
    },
  ];
  if (withTax) {
    entries.push({
      id: id * 10 + 1,
      ref_type: "transaction_tax",
      context_id_type: "market_transaction_id",
      context_id: id,
      amount: -1.8,
      date: SOLD_AT,
    });
  }
  return entries;
}

function setUp({
  orders = [ORDER],
  linked = [900],
  jobs = [{ itemID: 34, jobStatus: LAST_JOB_STATUS_ID }],
  transactions = [
    { transaction_id: 1, type_id: 34, location_id: 60003760, quantity: 7, unit_price: 5, date: SOLD_AT },
  ],
  journal = journalFor(1),
} = {}) {
  characterOrders.data = { "hash-1": orders };
  corporationOrders.data = {};
  characterTransactions.data = { "hash-1": transactions };
  characterJournal.data = { 2117000001: journal };
  linkedOrders.clear();
  linked.forEach((id) => linkedOrders.add(id));
  linkedTrans.clear();
  store.jobData = { jobArray: jobs };
}

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <NewTransactions />
    </QueryClientProvider>,
  );
}

describe("the sales the dashboard offers as new", () => {
  it("lists a sale made through a linked order for a job awaiting sale", () => {
    setUp();

    renderPanel();

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(screen.getByText(/7 @/)).toBeInTheDocument();
  });

  // An order nobody linked belongs to no job here.
  it("ignores an order the account has not linked", () => {
    setUp({ linked: [] });

    renderPanel();

    expect(screen.queryByText("Tritanium")).not.toBeInTheDocument();
  });

  // Only jobs waiting to be sold are looking for income.
  it("ignores orders for items no waiting job produces", () => {
    setUp({ jobs: [{ itemID: 35, jobStatus: LAST_JOB_STATUS_ID }] });

    renderPanel();

    expect(screen.queryByText("Tritanium")).not.toBeInTheDocument();
  });

  it("ignores jobs that are not waiting to be sold", () => {
    setUp({ jobs: [{ itemID: 34, jobStatus: 0 }] });

    renderPanel();

    expect(screen.queryByText("Tritanium")).not.toBeInTheDocument();
  });

  // The same completeness rule the job's own panel applies.
  it("waits for the tax entry before showing a sale", () => {
    setUp({ journal: journalFor(1, { withTax: false }) });

    renderPanel();

    expect(screen.queryByText("Tritanium")).not.toBeInTheDocument();
  });

  // Two orders for the same item at the same station see the same sale.
  it("shows a sale once even when two linked orders could claim it", () => {
    setUp({
      orders: [ORDER, { ...ORDER, order_id: 901 }],
      linked: [900, 901],
    });

    renderPanel();

    expect(screen.getAllByText("Tritanium")).toHaveLength(1);
  });
});
