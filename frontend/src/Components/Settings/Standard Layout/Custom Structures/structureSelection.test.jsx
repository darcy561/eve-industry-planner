import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import StructureOptionsSelection_CustomStructures from "./structureSelection";
import { jobTypes } from "../../../../Context/defaultValues";
import { testQueryClient } from "../../../../tests/queryClients.js";

const addCustomStructure = vi.fn();
const addCustomStructureFunction = vi.fn();

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } = await import(
    "../../../../tests/usersStoreHarness.js"
  );
  return usersStoreMock({});
});

vi.mock("../../../../Functions/Structure/addCustomStructure", () => ({
  addCustomStructure: (...args) => addCustomStructureFunction(...args),
}));

vi.mock("../../../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedApplicationSettingsSave: vi.fn(),
}));

/**
 * The structure form is the same form whatever screen it is on. These cover what
 * it offers and what it does with what a reader types, so the layout underneath
 * can change without the behaviour going quiet.
 */
function renderForm(props = {}) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <StructureOptionsSelection_CustomStructures
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
    expect(screen.getByRole("button", { name: /add structure/i })).toBeInTheDocument();
  });

  it("labels each field with what it is for", () => {
    renderForm();

    // A select carries its own label as well as the field's, so each of these
    // is present once as the field heading and once on the control.
    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(screen.getByText("Structure rigs")).toBeInTheDocument();
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
    expect(call[0].selectedJobType).toBe(jobTypes.manufacturing);
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
