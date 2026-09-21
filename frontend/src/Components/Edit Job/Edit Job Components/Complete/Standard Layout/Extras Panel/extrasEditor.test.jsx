import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { snackbarSpies } from "../../../../../../tests/snackbarHarness.js";
import { withQueryClient } from "../../../../../../tests/utils.js";
import { renderCounts } from "../../../../../../tests/renderCounts.jsx";

const { showSnackbarError } = snackbarSpies;

vi.mock("../../../../../../Events/snackbarEvents", async () => {
  const { snackbarMock } =
    await import("../../../../../../tests/snackbarHarness.js");
  return snackbarMock();
});

// The store itself, so what the panel reads and what it re-renders on are the
// ones it has in the app.
vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreOverSession } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreOverSession({
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
const { default: useUsersStore } =
  await import("../../../../../../Zustand/usersStore");
const { draftFor } =
  await import("../../../../Edit Job Hooks/jobDraftStore.js");

const session = () => useUsersStore.getState().editSession;
const extrasCosts = () => draftFor(session().draft, "job-1").build.extrasCosts;

const openJob = (rows = []) =>
  session().actions.openJob("job-1", {
    jobID: "job-1",
    name: "Rifter",
    build: {
      extrasCosts: Object.fromEntries(rows.map((row) => [row.id, row])),
    },
  });

const renderEditor = (rows) => {
  openJob(rows);
  render(withQueryClient(<ExtrasEditor />));
};

const hauling = {
  id: "a",
  categoryLabel: "Hauling Service",
  extraText: "Jita to Amarr",
  extraValue: 12000,
};

const addCost = async (description, cost) => {
  if (description) {
    await userEvent.type(
      screen.getByPlaceholderText("Enter description…"),
      description,
    );
  }
  if (cost !== undefined) {
    await userEvent.clear(screen.getByPlaceholderText("0.00"));
    await userEvent.type(screen.getByPlaceholderText("0.00"), cost);
  }
  await userEvent.click(screen.getByRole("button", { name: "Add extra cost" }));
};

beforeEach(() => {
  vi.clearAllMocks();
  session().actions.closeSession();
});

describe("the extras editor", () => {
  it("lists what the job already carries", () => {
    renderEditor([hauling]);

    expect(screen.getByText("Jita to Amarr")).toBeInTheDocument();
    expect(screen.getByText("12,000.00 ISK")).toBeInTheDocument();
  });

  it("says what the section is for when the job carries nothing", () => {
    renderEditor();

    expect(
      screen.getByText(/Hauling, copies and loyalty point costs/),
    ).toBeInTheDocument();
  });

  // A cost of nothing is a mistyped row, not an extra worth recording.
  it("refuses a cost that is not a positive number", async () => {
    renderEditor();

    await addCost("Hauling");

    expect(extrasCosts()).toEqual({});
    expect(showSnackbarError).toHaveBeenCalled();
  });

  it("refuses an uncategorised row with no description to identify it", async () => {
    renderEditor();

    await addCost(undefined, "500");

    expect(extrasCosts()).toEqual({});
  });

  it("adds a described cost and tells the job", async () => {
    renderEditor();

    await addCost("Hauling", "500");

    expect(Object.values(extrasCosts())).toEqual([
      expect.objectContaining({ extraText: "Hauling", extraValue: 500 }),
    ]);
    expect(session().draft.log.map((entry) => entry.command)).toEqual([
      "add extra cost",
    ]);
    expect(screen.getByText("Hauling")).toBeInTheDocument();
  });

  // Description text reaches the job document, so it is sanitised on the way in.
  it("strips markup from a description", async () => {
    renderEditor();

    await addCost("Haul <img src=x onerror=alert(1)>", "500");

    const [added] = Object.values(extrasCosts());
    expect(added.extraText).not.toContain("<img");
  });

  it("removes a row on request", async () => {
    renderEditor([hauling]);

    await userEvent.click(
      screen.getByRole("button", { name: "Remove Jita to Amarr" }),
    );

    expect(extrasCosts()).toEqual({});
    expect(screen.queryByText("Jita to Amarr")).not.toBeInTheDocument();
  });

  // What the conversion is for. The panel is handed nothing and reads one field,
  // so an edit anywhere else in the job leaves it alone.
  it("is not re-rendered by a change to the rest of the job", async () => {
    const renders = renderCounts();
    const Counted = renders.watch("extras", ExtrasEditor);
    openJob([hauling]);
    render(withQueryClient(<Counted />));
    renders.reset();

    await act(async () => {
      session().actions.run({
        name: "rename",
        recipe: (job) => {
          job.name = "Punisher";
        },
      });
    });

    expect(renders.of("extras")).toBe(0);
  });
});
