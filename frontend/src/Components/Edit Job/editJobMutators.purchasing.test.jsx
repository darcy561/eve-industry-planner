import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import { TRITANIUM, editJobStore } from "../../tests/editJobFixtures";

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

vi.mock("../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: vi.fn(),
  showSnackbarError: vi.fn(),
  showSnackbarWarning: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

vi.mock("../../Events/editJobNavigationEvents", () => ({
  requestEditJobNavigation: vi.fn(),
}));

const { renderOverEditJob, storedJob } =
  await import("../../tests/editJobHarness.jsx");
const { AddMaterialCost_Purchasing } =
  await import("./Edit Job Components/Purchasing/Standard Layout/Material Cards/addMaterialCosts.jsx");
const { MaterialCostsFrame_Purchasing } =
  await import("./Edit Job Components/Purchasing/Standard Layout/Material Cards/materialCostsFrame.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

/** A job needing a quantity of one material, with nothing bought yet. */
function needing(quantity, { purchasing = [] } = {}) {
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
      materials: [
        {
          typeID: TRITANIUM,
          name: "Tritanium",
          quantity,
          jobType: 0,
          purchasing,
        },
      ],
      childJobs: {},
    },
  });
}

function materialOf(state) {
  return state.activeJob.build.materials[0];
}

describe("costing the materials a job needs, end to end", () => {
  it("charges the job for what was bought", () => {
    const { editJob } = renderOverEditJob(
      needing(100),
      ({ state, actions }) => (
        <AddMaterialCost_Purchasing
          state={state}
          actions={actions}
          material={materialOf(state)}
          childJobs={[]}
          childSupply={{ min: 0 }}
        />
      ),
    );

    fireEvent.change(screen.getByLabelText("Quantity"), {
      target: { value: "100" },
    });
    fireEvent.change(screen.getByLabelText("Price"), {
      target: { value: "5" },
    });
    fireEvent.submit(screen.getByLabelText("Quantity").closest("form"));

    const material = materialOf(editJob.current);
    expect(material.purchasing).toHaveLength(1);
    expect(material.purchasing[0].itemCount).toBe(100);
    expect(material.purchasing[0].itemCost).toBe(5);
  });

  // Buying more than the job needs is allowed, but the job is only charged for
  // what it needed.
  it("does not charge the job for more than it needed", () => {
    const { editJob } = renderOverEditJob(
      needing(100),
      ({ state, actions }) => (
        <AddMaterialCost_Purchasing
          state={state}
          actions={actions}
          material={materialOf(state)}
          childJobs={[]}
          childSupply={{ min: 0 }}
        />
      ),
    );

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
    expect(material.purchasing[0].itemCount).toBe(150);
    expect(material.quantityPurchased).toBe(100);
  });

  it("takes a purchase back off the job", () => {
    const { editJob } = renderOverEditJob(
      needing(100, {
        purchasing: [
          { id: "purchase-1", itemCount: 100, itemCost: 5, childJob: false },
        ],
      }),
      ({ state, actions }) => (
        <MaterialCostsFrame_Purchasing
          state={state}
          actions={actions}
          material={materialOf(state)}
        />
      ),
    );
    expect(materialOf(editJob.current).purchasing).toHaveLength(1);

    fireEvent.click(screen.getByTestId("ClearIcon"));

    expect(materialOf(editJob.current).purchasing).toHaveLength(0);
  });
});
