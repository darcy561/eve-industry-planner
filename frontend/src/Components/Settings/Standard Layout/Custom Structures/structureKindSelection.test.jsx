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
  // Every kind the model can express is a kind a reader can save. A kind the
  // class carries fields for and the picker does not offer is unreachable.
  it("offers every kind the model has", () => {
    renderPicker();

    for (const label of [
      "Manufacturing",
      "Reaction",
      "Invention",
      "Reprocessing",
      "NPC Station",
      "Player Citadel",
    ]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
    expect(screen.getAllByRole("radio")).toHaveLength(
      Object.keys(structureKinds).length,
    );
  });

  // The value is what the form reads to decide which fields to ask for, so a
  // label pointing at the wrong number would describe the wrong kind.
  it("reports the kind that was chosen", async () => {
    const { setSelectedJobType, setInitialSelectionMade } = renderPicker();

    await userEvent.click(
      screen.getByRole("radio", { name: "Player Citadel" }),
    );

    expect(setSelectedJobType).toHaveBeenCalledWith(
      structureKinds.citadelMarket,
    );
    expect(setInitialSelectionMade).toHaveBeenCalledWith(true);
  });

  it("reports a build kind by its own value too", async () => {
    const { setSelectedJobType } = renderPicker();

    await userEvent.click(screen.getByRole("radio", { name: "Reprocessing" }));

    expect(setSelectedJobType).toHaveBeenCalledWith(
      structureKinds.reprocessing,
    );
  });

  it("shows the kind already chosen", () => {
    renderPicker({ selectedJobType: structureKinds.npcStation });

    expect(screen.getByRole("radio", { name: "NPC Station" })).toBeChecked();
  });
});
