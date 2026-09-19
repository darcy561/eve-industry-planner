import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CustomStructureSelect from "./customStructure";
import { jobTypes } from "../../Context/defaultValues";

let structures = [];

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      applicationSettings: { customStructures: structures },
    }),
  );
});

function aStructure(overrides = {}) {
  return {
    id: "manStruct-1",
    jobType: jobTypes.manufacturing,
    name: "Jita Sotiyo",
    ...overrides,
  };
}

async function openTheMenu() {
  await userEvent.click(screen.getByRole("combobox"));
}

beforeEach(() => {
  structures = [];
});

describe("choosing a custom structure", () => {
  it("offers the structures of the kind it was asked for", async () => {
    structures = [aStructure()];

    render(
      <CustomStructureSelect
        value=""
        jobType={jobTypes.manufacturing}
        onChange={() => {}}
      />,
    );
    await openTheMenu();

    expect(screen.getByRole("option", { name: "Jita Sotiyo" })).toBeVisible();
  });

  // One list holds every kind, so a picker that did not filter would offer a
  // refinery as somewhere to build a ship.
  it("does not offer a structure of another kind", async () => {
    structures = [
      aStructure(),
      aStructure({
        id: "reprocessingStruct-1",
        jobType: jobTypes.reprocessing,
        name: "A refinery",
      }),
    ];

    render(
      <CustomStructureSelect
        value=""
        jobType={jobTypes.manufacturing}
        onChange={() => {}}
      />,
    );
    await openTheMenu();

    expect(screen.getByRole("option", { name: "Jita Sotiyo" })).toBeVisible();
    expect(
      screen.queryByRole("option", { name: "A refinery" }),
    ).not.toBeInTheDocument();
  });

  it("tells the reader when the saved structure is gone", async () => {
    structures = [];

    render(
      <CustomStructureSelect
        value="manStruct-deleted"
        jobType={jobTypes.manufacturing}
        onChange={() => {}}
      />,
    );
    await openTheMenu();

    expect(screen.getByText("(missing structure)")).toBeInTheDocument();
  });

  // A structure of another kind is as good as missing here: the setup names one
  // this picker would never offer.
  it("reads a structure of another kind as missing", async () => {
    structures = [
      aStructure({
        id: "reprocessingStruct-1",
        jobType: jobTypes.reprocessing,
        name: "A refinery",
      }),
    ];

    render(
      <CustomStructureSelect
        value="reprocessingStruct-1"
        jobType={jobTypes.manufacturing}
        onChange={() => {}}
      />,
    );
    await openTheMenu();

    expect(screen.getByText("(missing structure)")).toBeInTheDocument();
  });

  it("passes the chosen structure back by id", async () => {
    const onChange = vi.fn();
    structures = [aStructure()];

    render(
      <CustomStructureSelect
        value=""
        jobType={jobTypes.manufacturing}
        onChange={onChange}
      />,
    );
    await openTheMenu();
    await userEvent.click(screen.getByRole("option", { name: "Jita Sotiyo" }));

    expect(onChange).toHaveBeenCalledWith("manStruct-1");
  });
});
