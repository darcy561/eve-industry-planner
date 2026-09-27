import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StructureKindSelection from "./structureKindSelection";
import { structureKinds } from "../../../../Context/defaultValues";

function renderPicker(props = {}) {
  const setSelectedJobType = vi.fn();
  const setInitialSelectionMade = vi.fn();
  render(
    <StructureKindSelection
      selectedJobType={null}
      setSelectedJobType={setSelectedJobType}
      setInitialSelectionMade={setInitialSelectionMade}
      {...props}
    />,
  );
  return { setSelectedJobType, setInitialSelectionMade };
}

describe("choosing what kind of structure to save", () => {
  it("offers every kind of place a job is performed in", () => {
    renderPicker();

    for (const label of [
      "Manufacturing",
      "Reaction",
      "Invention",
      "Reprocessing",
    ]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(4);
  });

  it("does not offer a market", () => {
    renderPicker();

    expect(screen.queryByRole("radio", { name: "Market" })).toBeNull();
  });

  it("reports the kind that was chosen", async () => {
    const { setSelectedJobType, setInitialSelectionMade } = renderPicker();

    await userEvent.click(screen.getByRole("radio", { name: "Reprocessing" }));

    expect(setSelectedJobType).toHaveBeenCalledWith(
      structureKinds.reprocessing,
    );
    expect(setInitialSelectionMade).toHaveBeenCalledWith(true);
  });

  it("shows the kind already chosen", () => {
    renderPicker({ selectedJobType: structureKinds.reaction });

    expect(screen.getByRole("radio", { name: "Reaction" })).toBeChecked();
  });
});
