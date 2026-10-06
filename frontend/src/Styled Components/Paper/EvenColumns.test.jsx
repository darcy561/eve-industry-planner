import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { EvenColumns } from "./EvenColumns.jsx";

describe("even columns", () => {
  it("lays its children out in a grid", () => {
    render(
      <EvenColumns data-testid="columns">
        <span>One</span>
        <span>Two</span>
      </EvenColumns>,
    );

    const columns = screen.getByTestId("columns");
    expect(columns).toHaveStyle({ display: "grid" });
    expect(screen.getByText("Two")).toBeInTheDocument();
  });

  it("passes its own attributes through, so it can be a named group", () => {
    render(
      <EvenColumns
        component="fieldset"
        role="radiogroup"
        aria-label="Direction"
      >
        <span>One</span>
      </EvenColumns>,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Direction" }),
    ).toBeInTheDocument();
  });
});
