import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import Group from "../../Classes/group";
import { editJobStore } from "../../tests/editJobFixtures";

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
const { default: InventionEditor } =
  await import("./Edit Job Components/Planning/Standard Layout/Cost Breakdown/inventionEditor.jsx");
const { default: ExtrasEditor } =
  await import("./Edit Job Components/Complete/Standard Layout/Extras Panel/extrasEditor.jsx");

let group = null;
beforeEach(() => {
  vi.clearAllMocks();
  readOnly.current = false;
  group = new Group({ groupID: "group-1" });
  store.current = editJobStore({ group });
});

describe("the costs a reader adds by hand, end to end", () => {
  function costsOf(state) {
    return state.activeJob.build.costs;
  }

  it("records what invention cost", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobType: 1 }),
      ({ state, actions }) => (
        <InventionEditor state={state} actions={actions} />
      ),
    );

    fireEvent.change(screen.getByPlaceholderText("What invention used…"), {
      target: { value: "Datacores" },
    });
    fireEvent.change(screen.getByRole("spinbutton"), {
      target: { value: "2500" },
    });
    // The control is a labelled button inside a tooltip that carries the same
    // name, so the button itself is what to press.
    fireEvent.click(screen.getByRole("button", { name: "Add invention cost" }));

    const entries = costsOf(editJob.current).inventionEntries;
    expect(entries).toHaveLength(1);
    expect(entries[0].itemName).toBe("Datacores");
    expect(entries[0].itemCost).toBe(2500);
  });

  it("records an extra the job was charged", () => {
    const { editJob } = renderOverEditJob(
      storedJob({ jobStatus: 4 }),
      ({ state, actions }) => <ExtrasEditor state={state} actions={actions} />,
    );

    fireEvent.change(screen.getByPlaceholderText("Enter description…"), {
      target: { value: "Courier collateral" },
    });
    fireEvent.change(screen.getByPlaceholderText("0.00"), {
      target: { value: "1200" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add extra cost" }));

    const extras = costsOf(editJob.current).extrasCosts;
    expect(extras).toHaveLength(1);
    expect(extras[0].extraText).toBe("Courier collateral");
    expect(extras[0].extraValue).toBe(1200);
  });

  it("takes an invention cost back off", () => {
    const { editJob } = renderOverEditJob(
      storedJob({
        jobType: 1,
        build: {
          setup: {},
          materials: [],
          childJobs: {},
          costs: {
            inventionEntries: [
              { id: "inv-1", itemName: "Datacores", itemCost: 2500 },
            ],
          },
        },
      }),
      ({ state, actions }) => (
        <InventionEditor state={state} actions={actions} />
      ),
    );
    expect(costsOf(editJob.current).inventionEntries).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Remove Datacores"));

    expect(costsOf(editJob.current).inventionEntries).toHaveLength(0);
  });

  it("takes an extra back off", () => {
    const { editJob } = renderOverEditJob(
      storedJob({
        jobStatus: 4,
        build: {
          setup: {},
          materials: [],
          childJobs: {},
          costs: {
            extrasCosts: [
              {
                id: "extra-1",
                category: 0,
                categoryLabel: "Other",
                extraText: "Courier collateral",
                extraValue: 1200,
              },
            ],
          },
        },
      }),
      ({ state, actions }) => <ExtrasEditor state={state} actions={actions} />,
    );
    expect(costsOf(editJob.current).extrasCosts).toHaveLength(1);

    fireEvent.click(screen.getByLabelText("Remove Courier collateral"));

    expect(costsOf(editJob.current).extrasCosts).toHaveLength(0);
  });
});
