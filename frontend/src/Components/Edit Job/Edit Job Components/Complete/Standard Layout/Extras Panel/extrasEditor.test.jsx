import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { snackbarSpies } from "../../../../../../tests/snackbarHarness.js";
import { withQueryClient } from "../../../../../../tests/utils.js";

const { showSnackbarError } = snackbarSpies;

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    plannerSettings: {
      byOwner: {
        "account:acc-1": {
          extrasCategories: [{ id: "0", label: "Unassigned" }],
        },
      },
    },
  });
});

vi.mock("../../../../../../Styled Components/Select/extrasCategories", () => ({
  default: () => <div />,
}));

const { default: ExtrasEditor } = await import("./extrasEditor");

const job = (rows = []) => ({
  build: { costs: { extrasCosts: rows } },
  addExtrasCost: vi.fn(),
  removeExtrasCost: vi.fn(),
});

const renderEditor = (activeJob) => {
  const actions = { updateActiveJob: vi.fn() };
  render(
    withQueryClient(<ExtrasEditor state={{ activeJob }} actions={actions} />),
  );
  return actions;
};

beforeEach(() => vi.clearAllMocks());

describe("the extras editor", () => {
  it("lists what the job already carries", () => {
    renderEditor(
      job([
        {
          id: "a",
          categoryLabel: "Hauling Service",
          extraText: "Jita to Amarr",
          extraValue: 12000,
        },
      ]),
    );

    expect(screen.getByText("Jita to Amarr")).toBeInTheDocument();
    expect(screen.getByText("12,000.00 ISK")).toBeInTheDocument();
  });

  it("says what the section is for when the job carries nothing", () => {
    renderEditor(job());

    expect(
      screen.getByText(/Hauling, copies and loyalty point costs/),
    ).toBeInTheDocument();
  });

  // A cost of nothing is a mistyped row, not an extra worth recording.
  it("refuses a cost that is not a positive number", async () => {
    const activeJob = job();
    renderEditor(activeJob);

    await userEvent.type(
      screen.getByPlaceholderText("Enter description…"),
      "Hauling",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Add extra cost" }),
    );

    expect(activeJob.addExtrasCost).not.toHaveBeenCalled();
    expect(showSnackbarError).toHaveBeenCalled();
  });

  it("refuses an uncategorised row with no description to identify it", async () => {
    const activeJob = job();
    renderEditor(activeJob);

    await userEvent.clear(screen.getByPlaceholderText("0.00"));
    await userEvent.type(screen.getByPlaceholderText("0.00"), "500");
    await userEvent.click(
      screen.getByRole("button", { name: "Add extra cost" }),
    );

    expect(activeJob.addExtrasCost).not.toHaveBeenCalled();
  });

  it("adds a described cost and tells the job", async () => {
    const activeJob = job();
    const actions = renderEditor(activeJob);

    await userEvent.type(
      screen.getByPlaceholderText("Enter description…"),
      "Hauling",
    );
    await userEvent.clear(screen.getByPlaceholderText("0.00"));
    await userEvent.type(screen.getByPlaceholderText("0.00"), "500");
    await userEvent.click(
      screen.getByRole("button", { name: "Add extra cost" }),
    );

    expect(activeJob.addExtrasCost).toHaveBeenCalledWith(
      expect.objectContaining({ extraText: "Hauling", extraValue: 500 }),
    );
    expect(actions.updateActiveJob).toHaveBeenCalled();
  });

  // Description text reaches the job document, so it is sanitised on the way in.
  it("strips markup from a description", async () => {
    const activeJob = job();
    renderEditor(activeJob);

    await userEvent.type(
      screen.getByPlaceholderText("Enter description…"),
      "Haul <img src=x onerror=alert(1)>",
    );
    await userEvent.clear(screen.getByPlaceholderText("0.00"));
    await userEvent.type(screen.getByPlaceholderText("0.00"), "500");
    await userEvent.click(
      screen.getByRole("button", { name: "Add extra cost" }),
    );

    const added = activeJob.addExtrasCost.mock.calls[0][0];
    expect(added.extraText).not.toContain("<img");
  });

  it("removes a row on request", async () => {
    const row = {
      id: "a",
      categoryLabel: "Hauling Service",
      extraText: "Jita to Amarr",
      extraValue: 12000,
    };
    const activeJob = job([row]);
    renderEditor(activeJob);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Jita to Amarr" }),
    );

    expect(activeJob.removeExtrasCost).toHaveBeenCalledWith(row);
  });
});
