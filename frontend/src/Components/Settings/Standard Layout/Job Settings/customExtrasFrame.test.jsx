import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withQueryClient } from "../../../../tests/utils.js";

const { store, addPlannerExtrasCategory, setPlannerExtrasCategoryDeleted } =
  vi.hoisted(() => {
    const addPlannerExtrasCategory = vi.fn();
    const setPlannerExtrasCategoryDeleted = vi.fn();
    return {
      addPlannerExtrasCategory,
      setPlannerExtrasCategoryDeleted,
      store: {
        account: { isLoggedIn: true },
        plannerSettings: {
          byOwner: {
            "account:acc-1": {
              extrasCategories: [
                { id: "0", label: "Unassigned" },
                { id: "5", label: "Other" },
                { id: "courier", label: "Courier" },
                { id: "gone", label: "Retired", deleted: true },
              ],
            },
          },
          actions: {
            addPlannerExtrasCategory,
            setPlannerExtrasCategoryDeleted,
            loadPlannerSettings: vi.fn(async () => null),
          },
        },
      },
    };
  });

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

const scheduleDebouncedPlannerSettingsSave = vi.fn();
vi.mock(
  "../../../../Functions/Debounce/plannerSettingsPersistSchedule.js",
  () => ({
    scheduleDebouncedPlannerSettingsSave: (owner) =>
      scheduleDebouncedPlannerSettingsSave(owner),
  }),
);

const { default: CustomExtrasFrame } = await import("./customExtrasFrame");

beforeEach(() => vi.clearAllMocks());

const renderFrame = () => render(withQueryClient(<CustomExtrasFrame />));

describe("the extras categories a planner offers", () => {
  // Until the planner's own list arrives the frame is showing the fallback
  // defaults, and saving an edit to those would replace the planner's list.
  it("cannot be edited while the planner's list is still being read", async () => {
    const user = userEvent.setup();
    const held = store.plannerSettings.byOwner;
    store.plannerSettings.byOwner = {};
    try {
      renderFrame();

      await user.type(screen.getByLabelText("Extra Category Name"), "Freight");

      expect(screen.getByLabelText("Add extras category")).toBeDisabled();
      expect(screen.queryByTestId("CloseIcon")).toBeNull();
      expect(screen.queryByTestId("UndoIcon")).toBeNull();
    } finally {
      store.plannerSettings.byOwner = held;
    }
  });

  it("lists the active planner's categories, deleted ones apart", () => {
    renderFrame();

    expect(screen.getByText("Courier")).toBeInTheDocument();
    expect(screen.getByText("Retired")).toBeInTheDocument();
  });

  it("adds a category to the planner and schedules the write", async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.type(screen.getByLabelText("Extra Category Name"), "Freight");
    await user.click(screen.getByLabelText("Add extras category"));

    expect(addPlannerExtrasCategory).toHaveBeenCalledWith("account:acc-1", {
      id: expect.any(String),
      label: "Freight",
    });
    expect(scheduleDebouncedPlannerSettingsSave).toHaveBeenCalledWith(
      "account:acc-1",
    );
  });

  // Stripping the markup leaves nothing to label the category with, and the
  // server refuses such a list — so nothing is added and the text stays put for
  // the reader to see what was not accepted.
  it("adds nothing when the typed name is only markup", async () => {
    const user = userEvent.setup();
    renderFrame();

    const field = screen.getByLabelText("Extra Category Name");
    await user.type(field, "<b></b>");
    await user.click(screen.getByLabelText("Add extras category"));

    expect(addPlannerExtrasCategory).not.toHaveBeenCalled();
    expect(scheduleDebouncedPlannerSettingsSave).not.toHaveBeenCalled();
    expect(field).toHaveValue("<b></b>");
  });

  it("stores the name with its markup stripped", async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.type(
      screen.getByLabelText("Extra Category Name"),
      "<b>Freight</b>",
    );
    await user.click(screen.getByLabelText("Add extras category"));

    expect(addPlannerExtrasCategory).toHaveBeenCalledWith("account:acc-1", {
      id: expect.any(String),
      label: "Freight",
    });
  });

  // Costs already filed under a category name it by id, so the two categories
  // every list keeps carry no way to remove them.
  it("offers no delete control for the permanent categories", () => {
    renderFrame();

    expect(screen.getAllByTestId("CloseIcon")).toHaveLength(1);
  });

  it("marks a category deleted on the planner and schedules the write", async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.click(screen.getByTestId("CloseIcon"));

    expect(setPlannerExtrasCategoryDeleted).toHaveBeenCalledWith(
      "account:acc-1",
      "courier",
      true,
    );
    expect(scheduleDebouncedPlannerSettingsSave).toHaveBeenCalledWith(
      "account:acc-1",
    );
  });

  it("brings a deleted category back", async () => {
    const user = userEvent.setup();
    renderFrame();

    await user.click(screen.getByTestId("UndoIcon"));

    expect(setPlannerExtrasCategoryDeleted).toHaveBeenCalledWith(
      "account:acc-1",
      "gone",
      false,
    );
  });
});
