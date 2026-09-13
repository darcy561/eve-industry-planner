import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { FormField } from "./FormField";

describe("FormField", () => {
  it("labels the control and explains it", () => {
    render(
      <FormField
        title="Structure Type"
        description="Decides the bonuses and available rigs."
      >
        <input aria-label="structure type" />
      </FormField>,
    );

    expect(screen.getByText("Structure Type")).toBeInTheDocument();
    expect(
      screen.getByText("Decides the bonuses and available rigs."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("structure type")).toBeInTheDocument();
  });

  it("wraps a control given neither a title nor a description", () => {
    // The citadel-names switch is wrapped for its spacing alone, so the label
    // and description lines must not be rendered empty around it.
    const { container } = render(
      <FormField>
        <input aria-label="share citadel names" />
      </FormField>,
    );

    expect(screen.getByLabelText("share citadel names")).toBeInTheDocument();
    expect(container.querySelectorAll(".MuiTypography-root")).toHaveLength(0);
  });

  it("takes a title without a description", () => {
    const { container } = render(
      <FormField title="Display name">
        <input aria-label="display name" />
      </FormField>,
    );

    expect(screen.getByText("Display name")).toBeInTheDocument();
    expect(container.querySelectorAll(".MuiTypography-root")).toHaveLength(1);
  });
});
