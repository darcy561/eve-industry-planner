import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import {
  editJobStore,
  esiMarketOrder,
  linkedTransaction,
} from "../../tests/editJobFixtures";

const { store, readOnly } = vi.hoisted(() => ({
  store: { current: null },
  readOnly: { current: false },
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

vi.mock("./Edit Job Hooks/useActiveJobDocumentLock", () => ({
  useActiveJobReadOnly: () => readOnly.current,
  useSiblingLinkLock: () => ({ readOnly: readOnly.current, reason: "" }),
}));

vi.mock("../../Events/snackbarEvents", async () => {
  const { snackbarMock } = await import("../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { LinkedTransactionPanel } =
  await import("./Edit Job Components/Selling/Standard Layout/Linked Transaction Panel/linkedTransactionPanel.jsx");
const { AddCustomTransactionDialogue } =
  await import("./Edit Job Components/Selling/Standard Layout/Linked Transaction Panel/addCustomTransaction.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

describe("recording a sale by hand, end to end", () => {
  it("puts the sale on the job", () => {
    const { editJob } = renderOverEditJob(
      storedJob({
        build: {
          setup: {},
          materials: {},
          childJobs: {},
        },
        esi: { transactions: {} },
      }),
      () => <AddCustomTransactionDialogue onClose={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const sales = editJob.current.activeJob.salesByDate;
    expect(sales).toHaveLength(1);
    expect(sales[0].type_id).toBe(587);
    expect(editJob.current.jobModified).toBe(true);
  });

  it("records nothing while the job is locked by another session", () => {
    readOnly.current = true;
    const { editJob } = renderOverEditJob(
      storedJob({
        build: {
          setup: {},
          materials: {},
          childJobs: {},
        },
        esi: { transactions: {} },
      }),
      () => <AddCustomTransactionDialogue onClose={() => {}} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(
      Object.keys(editJob.current.activeJob.esi.transactions),
    ).toHaveLength(0);
  });
});

describe("unlinking a sale from a job, end to end", () => {
  it("takes the sale off the job and remembers it to save", () => {
    const { editJob } = renderOverEditJob(
      storedJob({
        jobStatus: 4,
        build: {
          setup: {},
          materials: {},
          childJobs: {},
        },
        esi: {
          marketOrders: { 700001: esiMarketOrder(700001) },
          transactions: { 800001: linkedTransaction(800001) },
        },
      }),
      () => <LinkedTransactionPanel />,
    );
    expect(editJob.current.activeJob.esi.transactions["800001"]).toBeDefined();

    fireEvent.click(screen.getByTestId("ClearIcon").closest("button"));

    expect(
      Object.keys(editJob.current.activeJob.esi.transactions),
    ).toHaveLength(0);
    expect(editJob.current.esiDataToLink.transactions.remove).toContain(800001);
  });
});
