import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { createTheme } from "@mui/material/styles";
import { SpreadBar, spreadLegendKeys, spreadTrackColour } from "./SpreadBar";

const show = (props = {}) =>
  render(
    <SpreadBar
      axis={{ low: 0, high: 200 }}
      likely={{ low: 50, high: 100 }}
      expected={80}
      colour="rgb(1, 2, 3)"
      label="Value"
      {...props}
    />,
  );

describe("a spread bar", () => {
  it("draws the likely span where it falls on the axis", () => {
    show();

    const likely = screen.getByTestId("spread-likely");
    expect(getComputedStyle(likely).left).toBe("25%");
    expect(getComputedStyle(likely).width).toBe("25%");
  });

  it("marks the expected value", () => {
    show();

    expect(getComputedStyle(screen.getByTestId("spread-expected")).left).toBe(
      "40%",
    );
  });

  it("spans the whole axis with what is possible unless told otherwise", () => {
    const { rerender } = show();
    expect(getComputedStyle(screen.getByTestId("spread-possible")).width).toBe(
      "100%",
    );

    rerender(
      <SpreadBar
        axis={{ low: 0, high: 200 }}
        possible={{ low: 20, high: 180 }}
        likely={{ low: 50, high: 100 }}
        expected={80}
        colour="rgb(1, 2, 3)"
        label="Value"
      />,
    );
    expect(getComputedStyle(screen.getByTestId("spread-possible")).left).toBe(
      "10%",
    );
  });

  it("keeps a figure beyond the axis on its end", () => {
    show({ expected: 400 });

    expect(getComputedStyle(screen.getByTestId("spread-expected")).left).toBe(
      "100%",
    );
  });

  it("marks and labels a figure it is set against", () => {
    show({
      marks: [{ id: "asIs", value: 150, colour: "red", label: "as they are" }],
    });

    expect(getComputedStyle(screen.getByTestId("spread-mark-asIs")).left).toBe(
      "75%",
    );
    expect(screen.getByText("as they are")).toBeInTheDocument();
  });

  it("is named for a reader who cannot see it", () => {
    show();

    expect(screen.getByRole("img", { name: "Value" })).toBeInTheDocument();
  });
});

describe("a spread bar's key", () => {
  it("names what is possible, the likely span and the expected mark, then its marks as lines", () => {
    const theme = createTheme();
    const keys = spreadLegendKeys(theme, {
      possible: "Possible",
      likely: "Likely",
      colour: "blue",
      marks: [{ id: "asIs", label: "Sold as they are", colour: "orange" }],
    });

    expect(keys.map((key) => key.id)).toEqual([
      "possible",
      "likely",
      "expected",
      "asIs",
    ]);
    expect(keys[0].colour).toBe(spreadTrackColour(theme));
    expect(keys[3].shape).toBe("line");
  });
});
