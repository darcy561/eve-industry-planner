import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import Group from "../../Classes/group";
import { TRITANIUM, editJobStore } from "../../tests/editJobFixtures";
import { snackbarSpies } from "../../tests/snackbarHarness.js";

const { store, readOnly, pasted } = vi.hoisted(() => ({
  store: { current: null },
  readOnly: { current: false },
  pasted: { current: [] },
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

vi.mock("../../Functions/Clipboard/importMultibuy", () => ({
  default: async () => pasted.current,
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { AddMaterialCost_Purchasing } =
  await import("./Edit Job Components/Purchasing/Standard Layout/Material Cards/addMaterialCosts.jsx");
const { MaterialCostsFrame_Purchasing } =
  await import("./Edit Job Components/Purchasing/Standard Layout/Material Cards/materialCostsFrame.jsx");
const { committedFor } = await import("./Edit Job Hooks/jobDraftStore.js");
const { default: useUsersStore } = await import("../../Zustand/usersStore");
const { PurchasingDataPanel_EditJob } =
  await import("./Edit Job Components/Purchasing/Standard Layout/Purchasing Data Panel/purchsingDataPanel.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  pasted.current = [];
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

/** A job needing a quantity of one material, with nothing bought yet. */
function needing(quantity, { purchasing = {} } = {}) {
  return storedJob({
    jobStatus: 2,
    build: {
      setup: {
        "setup-1": {
          id: "setup-1",
          runCount: 1,
          jobCount: 1,
          materialCount: {
            [TRITANIUM]: { typeID: TRITANIUM, quantity },
          },
        },
      },
      materials: {
        [String(TRITANIUM)]: {
          typeID: TRITANIUM,
          name: "Tritanium",
          quantity,
          jobType: 0,
          purchasing,
        },
      },
      childJobs: {},
    },
  });
}

function materialOf(state) {
  return Object.values(state.activeJob.build.materials)[0];
}

describe("costing the materials a job needs, end to end", () => {
  it("charges the job for what was bought", () => {
    const { editJob } = renderOverEditJob(needing(100), ({ state }) => (
      <AddMaterialCost_Purchasing
        material={materialOf(state)}
        childJobs={[]}
        childSupply={{ min: 0 }}
      />
    ));

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByLabelText("Quantity").closest("form"));

    const material = materialOf(editJob.current);
    expect(Object.keys(material.purchasing)).toHaveLength(1);
    expect(Object.values(material.purchasing)[0].itemCount).toBe(100);
    expect(Object.values(material.purchasing)[0].itemCost).toBe(5);
  });

  // Buying more than the job needs is allowed, but the job is only charged for
  // what it needed.
  it("does not charge the job for more than it needed", () => {
    const { editJob } = renderOverEditJob(needing(100), ({ state }) => (
      <AddMaterialCost_Purchasing
        material={materialOf(state)}
        childJobs={[]}
        childSupply={{ min: 0 }}
      />
    ));

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "150" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByLabelText("Quantity").closest("form"));

    const material = materialOf(editJob.current);
    // The whole purchase is kept — a reader who bought 150 bought 150 — but the
    // job is only charged for the 100 it needed.
    expect(Object.values(material.purchasing)[0].itemCount).toBe(150);
    expect(material.quantityPurchased).toBe(100);
  });

  it("takes a purchase back off the job", () => {
    const { editJob } = renderOverEditJob(
      needing(100, {
        purchasing: {
          "purchase-1": {
            id: "purchase-1",
            itemCount: 100,
            itemCost: 5,
            childJob: false,
          },
        },
      }),
      ({ state, actions }) => (
        <MaterialCostsFrame_Purchasing
          state={state}
          actions={actions}
          material={materialOf(state)}
        />
      ),
    );
    expect(Object.keys(materialOf(editJob.current).purchasing)).toHaveLength(1);

    fireEvent.click(screen.getByTestId("ClearIcon"));

    expect(Object.keys(materialOf(editJob.current).purchasing)).toHaveLength(0);
  });
});

// A job keys its materials by type id, so the paste has to walk them as a
// collection rather than an array — reading them as one threw where a reader
// pressed the button.
describe("importing costs pasted from the game, end to end", () => {
  // The tooltip supplies the button's accessible name, so it is found by the
  // words on it rather than by role and name.
  const importCosts = () =>
    fireEvent.click(screen.getByText("Import Costs From Multibuy"));

  it("charges the job for what the paste covers", async () => {
    pasted.current = [
      { importedName: "Tritanium", importedQuantity: 100, importedCost: 5 },
    ];
    const { editJob } = renderOverEditJob(needing(100), () => (
      <PurchasingDataPanel_EditJob />
    ));

    importCosts();

    await vi.waitFor(() =>
      expect(materialOf(editJob.current).quantityPurchased).toBe(100),
    );
    expect(materialOf(editJob.current).purchasedCost).toBe(500);
  });

  it("says so when the paste names nothing the job needs", async () => {
    pasted.current = [
      { importedName: "Pyerite", importedQuantity: 10, importedCost: 5 },
    ];
    const { editJob } = renderOverEditJob(needing(100), () => (
      <PurchasingDataPanel_EditJob />
    ));

    importCosts();

    await vi.waitFor(() =>
      expect(snackbarSpies.showSnackbarError).toHaveBeenCalledWith(
        "No Matching Items Found",
      ),
    );
    expect(materialOf(editJob.current).quantityPurchased).toBe(0);
  });
});

// The buying market and order type are the job's own choice, stored on it. They were
// the last controls on this panel still calling an action the session no longer
// has, so pressing one threw.
describe("choosing where the job buys, end to end", () => {
  const openPanel = () =>
    renderOverEditJob(needing(100), () => <PurchasingDataPanel_EditJob />);

  const buyingPricing = () =>
    committedFor(useUsersStore.getState().editSession.draft, "job-1").build
      .localPricing?.buying;

  it("records the market the reader picked", async () => {
    openPanel();

    const [market] = screen.getAllByRole("combobox");
    fireEvent.mouseDown(market);
    const [, second] = within(screen.getByRole("listbox")).getAllByRole(
      "option",
    );
    // The option's own value rather than its label: a hub's id matches its name
    // today, but a saved structure's does not, so the label would be asserting a
    // coincidence.
    const chosen = second.getAttribute("data-value");
    fireEvent.click(second);

    await vi.waitFor(() => expect(buyingPricing()?.market).toBe(chosen));
  });
});
