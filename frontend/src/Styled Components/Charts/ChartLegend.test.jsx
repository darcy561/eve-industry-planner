import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChartLegend } from "./ChartLegend";

describe("a chart's key", () => {
  it("names each thing drawn beside its colour", () => {
    render(
      <ChartLegend
        keys={[
          { id: "likely", label: "Likely", colour: "rgb(1, 2, 3)" },
          {
            id: "expected",
            label: "Expected",
            colour: "rgb(4, 5, 6)",
            shape: "line",
          },
        ]}
      />,
    );

    expect(screen.getByText("Likely")).toBeInTheDocument();
    expect(screen.getByTestId("legend-likely")).toHaveStyle({
      backgroundColor: "rgb(1, 2, 3)",
      width: "9px",
    });
    expect(screen.getByTestId("legend-expected")).toHaveStyle({
      width: "2px",
    });
  });
});
