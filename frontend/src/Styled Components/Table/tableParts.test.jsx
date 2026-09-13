import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  createTheme,
} from "@mui/material";

import { ColumnHeaderRow, ScrollingTable } from "./tableParts";

const renderHeader = (columns) =>
  render(
    <Table>
      <ColumnHeaderRow columns={columns} />
    </Table>,
  );

describe("ColumnHeaderRow", () => {
  it("names the columns it is given, in order", () => {
    renderHeader([
      { id: "a", label: "Component" },
      { id: "b", label: "Total", align: "right" },
    ]);

    expect(
      screen.getAllByRole("columnheader").map((cell) => cell.textContent),
    ).toEqual(["Component", "Total"]);
  });

  it("takes the columns rather than fixing them", () => {
    // A panel shows a column only when it has something to put in it — the cost
    // table's comparison against a previous build appears only with history.
    renderHeader([{ id: "a", label: "Component" }]);

    expect(screen.getAllByRole("columnheader")).toHaveLength(1);
  });

  it("aligns a column the way it asks to be aligned", () => {
    renderHeader([{ id: "a", label: "Total", align: "right" }]);

    expect(screen.getByRole("columnheader")).toHaveStyle({
      textAlign: "right",
    });
  });
});

// A table left to itself squeezes its label column to a word a line and still
// runs off the side of the panel, because nothing contains it. Reported twice
// on two different tables before this moved into one place.
describe("a table in a window too narrow for it", () => {
  const renderScrolling = () =>
    render(
      <ScrollingTable minWidth="md" aria-label="Figures">
        <TableBody>
          <TableRow>
            <TableCell>Tritanium</TableCell>
          </TableRow>
        </TableBody>
      </ScrollingTable>,
    );

  it("scrolls rather than letting the table run off the panel", () => {
    renderScrolling();

    const scroller = screen.getByRole("table").parentElement;

    expect(getComputedStyle(scroller).overflowX).toBe("auto");
    expect(getComputedStyle(scroller).maxWidth).toBe("100%");
  });

  // Named from the theme rather than stated in pixels, so table widths speak the
  // same vocabulary as every other breakpoint in the app.
  it("takes its floor from the theme's breakpoints", () => {
    renderScrolling();

    expect(getComputedStyle(screen.getByRole("table")).minWidth).toBe(
      `${createTheme().breakpoints.values.md}px`,
    );
  });

  it("passes through what names the table", () => {
    renderScrolling();

    expect(screen.getByLabelText("Figures")).toBeInTheDocument();
  });
});
