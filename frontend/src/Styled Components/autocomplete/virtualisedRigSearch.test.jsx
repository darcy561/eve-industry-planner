import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

import VirtualisedRigSearch from "./virtualisedRigSearch";
import { jobTypes } from "../../Context/defaultValues";

const catalogue = {
  families: {
    3: { id: 3, name: "Ships" },
    14: { id: 14, name: "Components" },
  },
  sources: {
    100: {
      id: 100,
      label: "Basic Small Ship Material Efficiency I",
      kind: "rig",
      size: 2,
      bonuses: [
        { activity: "manufacturing", axis: "material", familyID: 3, value: 2 },
      ],
    },
    200: {
      id: 200,
      label: "Advanced Component Efficiency I",
      kind: "rig",
      size: 2,
      bonuses: [
        { activity: "manufacturing", axis: "material", familyID: 14, value: 2 },
      ],
    },
    300: {
      id: 300,
      label: "A Large Rig",
      kind: "rig",
      size: 3,
      bonuses: [
        { activity: "manufacturing", axis: "material", familyID: 3, value: 2 },
      ],
    },
  },
};

function show(props = {}) {
  return render(
    <ThemeProvider theme={createTheme()}>
      <VirtualisedRigSearch
        jobType={jobTypes.manufacturing}
        rigSize={2}
        catalogue={catalogue}
        onChange={vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe("the rig field", () => {
  it("shows the rig a setup already names, retired or not", async () => {
    show({ value: 9 });

    await vi.waitFor(() =>
      expect(screen.getByRole("combobox").value).toBe("Faction - ME - All"),
    );
  });

  it("shows no rig where the slot holds none", async () => {
    show();

    await vi.waitFor(() =>
      expect(screen.getByRole("combobox").value).toBe("None"),
    );
  });

  it("says why a slot was refused", () => {
    show({ error: { isError: true, errorText: "Cannot have the same rig" } });

    expect(screen.getByText("Cannot have the same rig")).toBeTruthy();
  });

  it("names the field", () => {
    show({ label: "Rig slot 1" });

    expect(screen.getByLabelText("Rig slot 1")).toBeTruthy();
  });
});
