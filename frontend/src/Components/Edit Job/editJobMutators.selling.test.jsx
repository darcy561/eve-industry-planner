import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import {
  AMARR_VIII,
  JITA_IV,
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
          materials: [],
          childJobs: {},
          sale: { transactions: [] },
        },
      }),
      ({ state, actions }) => (
        <AddCustomTransactionDialogue
          state={state}
          actions={actions}
          onClose={() => {}}
        />
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    const sales = editJob.current.activeJob.build.sale.transactions;
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
          materials: [],
          childJobs: {},
          sale: { transactions: [] },
        },
      }),
      ({ state, actions }) => (
        <AddCustomTransactionDialogue
          state={state}
          actions={actions}
          onClose={() => {}}
        />
      ),
    );

    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(editJob.current.activeJob.build.sale.transactions).toHaveLength(0);
  });
});

/** A job selling from two places at once, with a sale from each. */
function sellingFromTwoPlaces() {
  return storedJob({
    jobStatus: 4,
    build: {
      setup: {},
      materials: [],
      childJobs: {},
      sale: {
        marketOrders: [],
        brokersFee: [],
        transactions: [
          linkedTransaction(800001, { location_id: JITA_IV }),
          linkedTransaction(800002, { location_id: AMARR_VIII }),
        ],
      },
    },
  });
}

describe("which sales the linked panel shows", () => {
  it("shows every sale when nothing is being filtered on", () => {
    renderOverEditJob(sellingFromTwoPlaces(), ({ state, actions }) => (
      <LinkedTransactionPanel
        state={state}
        actions={actions}
        activeOrder={[]}
      />
    ));

    expect(screen.getAllByTestId("ClearIcon")).toHaveLength(2);
  });

  it("shows only the sales made where the reader is filtering", () => {
    renderOverEditJob(sellingFromTwoPlaces(), ({ state, actions }) => (
      <LinkedTransactionPanel
        state={state}
        actions={actions}
        activeOrder={[JITA_IV]}
      />
    ));

    expect(screen.getAllByTestId("ClearIcon")).toHaveLength(1);
  });

  // Filtering on a second place asks for both, not neither.
  it("shows the sales from every place being filtered on", () => {
    renderOverEditJob(sellingFromTwoPlaces(), ({ state, actions }) => (
      <LinkedTransactionPanel
        state={state}
        actions={actions}
        activeOrder={[JITA_IV, AMARR_VIII]}
      />
    ));

    expect(screen.getAllByTestId("ClearIcon")).toHaveLength(2);
  });
});

describe("unlinking a sale from a job, end to end", () => {
  it("takes the sale off the job and remembers it to save", () => {
    const { editJob } = renderOverEditJob(
      storedJob({
        jobStatus: 4,
        build: {
          setup: {},
          materials: [],
          childJobs: {},
          sale: {
            marketOrders: [esiMarketOrder(700001)],
            brokersFee: [],
            transactions: [linkedTransaction(800001)],
          },
        },
      }),
      ({ state, actions }) => (
        <LinkedTransactionPanel
          state={state}
          actions={actions}
          // The panel filters its rows by location, not by order id.
          activeOrder={[JITA_IV]}
        />
      ),
    );
    expect(editJob.current.activeJob.build.sale.transactions).toHaveLength(1);

    fireEvent.click(screen.getByTestId("ClearIcon").closest("button"));

    expect(editJob.current.activeJob.build.sale.transactions).toHaveLength(0);
    expect(editJob.current.esiDataToLink.transactions.remove).toContain(800001);
  });
});
