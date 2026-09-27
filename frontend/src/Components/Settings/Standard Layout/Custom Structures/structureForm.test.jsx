import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import StructureForm from "./structureForm";
import { jobTypes } from "../../../../Context/defaultValues";
import { testQueryClient } from "../../../../tests/queryClients.js";

const addCustomStructure = vi.fn();
const addCustomStructureFunction = vi.fn();
const showSnackbarSuccess = vi.fn();

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock({});
});

vi.mock("../../../../Functions/Custom Structures/addCustomStructure", () => ({
  addCustomStructure: (...args) => addCustomStructureFunction(...args),
}));

vi.mock("../../../../Events/snackbarEvents", () => ({
  showSnackbarSuccess: (...args) => showSnackbarSuccess(...args),
}));

vi.mock(
  "../../../../Functions/Debounce/userDocumentsPersistSchedule.js",
  () => ({
    scheduleDebouncedApplicationSettingsSave: vi.fn(),
  }),
);

/**
 * The structure form is the same form whatever screen it is on. These cover what
 * it offers and what it does with what a reader types, so the layout underneath
 * can change without the behaviour going quiet.
 */
function renderForm(props = {}) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <StructureForm
        selectedJobType={jobTypes.manufacturing}
        setIsLoading={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("the structure form", () => {
  beforeEach(() => {
    addCustomStructure.mockClear();
    addCustomStructureFunction.mockClear();
  });

  it("offers every part of a structure a reader has to choose", () => {
    renderForm();

    expect(screen.getByPlaceholderText("Display Name")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /add structure/i }),
    ).toBeInTheDocument();
  });

  it("labels each field with what it is for", () => {
    renderForm();

    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(screen.getByText("Rig slot 1")).toBeInTheDocument();
    expect(screen.getByText("Rig slot 2")).toBeInTheDocument();
    expect(screen.getByText("Solar System")).toBeInTheDocument();
    expect(screen.getAllByText("Structure Type").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Security Status").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Structure Tax").length).toBeGreaterThan(0);
  });

  it("keeps the name a reader types", async () => {
    const user = userEvent.setup();
    renderForm();

    const name = screen.getByPlaceholderText("Display Name");
    await user.type(name, "Sotiyo");

    expect(name).toHaveValue("Sotiyo");
  });

  it("adds the structure a reader has built", async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByPlaceholderText("Display Name"), "Sotiyo");
    await user.click(screen.getByRole("button", { name: /add structure/i }));

    expect(addCustomStructureFunction).toHaveBeenCalledTimes(1);
    const [call] = addCustomStructureFunction.mock.calls;
    expect(call[0].structure.name).toBe("Sotiyo");
    expect(call[0].structure.jobType).toBe(jobTypes.manufacturing);
  });

  it("empties the form once a structure is added", async () => {
    const user = userEvent.setup();
    renderForm();

    const name = screen.getByPlaceholderText("Display Name");
    await user.type(name, "Sotiyo");
    await user.click(screen.getByRole("button", { name: /add structure/i }));

    expect(screen.getByPlaceholderText("Display Name")).toHaveValue("");
  });

  it("builds the form for the job type it is given", () => {
    renderForm({ selectedJobType: jobTypes.reaction });

    expect(screen.getByPlaceholderText("Display Name")).toBeInTheDocument();
    expect(screen.getAllByText("Structure Type").length).toBeGreaterThan(0);
  });
});

describe("fitting two rigs", () => {
  async function chooseRig(slotLabel, rigLabel) {
    const field = screen.getByText(slotLabel).closest(".MuiGrid-root");
    await userEvent.click(within(field).getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: rigLabel }));
  }

  it("takes a rig in each slot when they do not compete", () => {
    renderForm();

    expect(screen.getByText("Rig slot 1")).toBeInTheDocument();
    expect(screen.getByText("Rig slot 2")).toBeInTheDocument();
  });

  it("refuses a rig that competes with the one already fitted", async () => {
    renderForm();

    await chooseRig("Rig slot 1", "T1 - ME - All");
    await chooseRig("Rig slot 2", "T2 - ME - All");

    expect(
      screen.getByText(
        "Cannot have the same rig or related rigs in both slots",
      ),
    ).toBeInTheDocument();
  });

  it("takes a rig that does something else", async () => {
    renderForm();

    await chooseRig("Rig slot 1", "T1 - ME - All");
    await chooseRig("Rig slot 2", "T1 - TE - All");

    expect(
      screen.queryByText(
        "Cannot have the same rig or related rigs in both slots",
      ),
    ).not.toBeInTheDocument();
  });
});

describe("what each kind is asked for", () => {
  const TITLES = [
    "Structure Type",
    "Rig slot 1",
    "Rig slot 2",
    "Implant",
    "Security Status",
    "Structure Tax",
    "Solar System",
  ];
  const asked = () =>
    TITLES.filter((title) =>
      screen
        .queryAllByText(title)
        .some((node) => !node.closest("label") && !node.closest("[role]")),
    );

  it("asks manufacturing for its rigs, tax, security and system", () => {
    renderForm({ selectedJobType: jobTypes.manufacturing });

    expect(asked()).toEqual([
      "Structure Type",
      "Rig slot 1",
      "Rig slot 2",
      "Security Status",
      "Structure Tax",
      "Solar System",
    ]);
  });

  it("asks reprocessing for an implant and no system", () => {
    renderForm({ selectedJobType: jobTypes.reprocessing });

    expect(asked()).toContain("Implant");
    expect(asked()).not.toContain("Solar System");
  });

  it("asks invention for neither an implant nor a system", () => {
    renderForm({ selectedJobType: jobTypes.invention });

    expect(asked()).not.toContain("Implant");
    expect(asked()).not.toContain("Solar System");
  });
});

describe("every field the form offers is one a kind stores", () => {
  it("stores what it asked for, for each kind that asks", async () => {
    const { STRUCTURE_FIELDS } = await import("./structureFields");
    const {
      fieldsForKind,
      structureFromDocument,
      structureToDocument,
      updateStructure,
    } = await import("../../../../Functions/Custom Structures/customStructure");

    const kinds = [
      jobTypes.manufacturing,
      jobTypes.reaction,
      jobTypes.reprocessing,
      jobTypes.invention,
    ];
    const asked = new Set();

    for (const jobType of kinds) {
      const fields = fieldsForKind(jobType);
      const structure = structureFromDocument(undefined, jobType);

      for (const entry of STRUCTURE_FIELDS.filter((field) =>
        field.shows(fields),
      )) {
        asked.add(entry.id);
        const changed = updateStructure(structure, { [entry.id]: 7 });

        expect(
          structureToDocument(changed),
          `${entry.id} on kind ${jobType}`,
        ).toHaveProperty(entry.id);
      }
    }

    expect([...asked].sort()).toEqual(
      STRUCTURE_FIELDS.map((entry) => entry.id).sort(),
    );
  });
});

describe("saving needs a name", () => {
  it("refuses a structure with no name and says why", async () => {
    renderForm({ selectedJobType: jobTypes.reprocessing });

    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).not.toHaveBeenCalled();
    expect(
      screen.getByText("Give this a name so you can tell it apart in lists."),
    ).toBeInTheDocument();
  });

  it("refuses another kind with no name too", async () => {
    renderForm({ selectedJobType: jobTypes.manufacturing });

    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).not.toHaveBeenCalled();
  });

  it("refuses a name that is only spaces", async () => {
    renderForm({ selectedJobType: jobTypes.reprocessing });

    await userEvent.type(screen.getByLabelText(/Structure name/i), "   ");
    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).not.toHaveBeenCalled();
  });

  it("stops saying so once a name is given", async () => {
    renderForm({ selectedJobType: jobTypes.reprocessing });
    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    await userEvent.type(screen.getByLabelText(/Structure name/i), "Jita");

    expect(
      screen.queryByText("Give this a name so you can tell it apart in lists."),
    ).not.toBeInTheDocument();
  });
});

describe("who tells the reader a structure was saved", () => {
  beforeEach(() => {
    addCustomStructureFunction.mockClear();
    showSnackbarSuccess.mockClear();
  });

  it("leaves it to the function that saved it", async () => {
    renderForm({ selectedJobType: jobTypes.reprocessing });

    await userEvent.type(screen.getByLabelText(/Structure name/i), "Athanor");
    await userEvent.click(
      screen.getByRole("button", { name: /Add structure/i }),
    );

    expect(addCustomStructureFunction).toHaveBeenCalledTimes(1);
    expect(showSnackbarSuccess).not.toHaveBeenCalled();
  });
});
