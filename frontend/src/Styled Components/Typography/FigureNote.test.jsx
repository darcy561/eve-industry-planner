import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FigureNote } from "./FigureNote";

describe("a note beneath a figure", () => {
  it("says what it is given, on its own line", () => {
    render(<FigureNote>likely 80 – 120</FigureNote>);

    expect(screen.getByText("likely 80 – 120").tagName).toBe("DIV");
  });
});
