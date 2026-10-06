import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
  createTheme,
} from "@mui/material";

import {
  BandRow,
  ColumnHeaderRow,
  DrawerRow,
  ScrollingTable,
  SummaryRow,
} from "./tableParts";
import { ExpandToggle } from "../IconButton/ExpandToggle";
import { FIGURE_TONE } from "../Typography/figures";

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

const inBody = (rows) =>
  render(
    <Table>
      <TableBody>{rows}</TableBody>
    </Table>,
  );

describe("a band across a table", () => {
  it("spans every column with its caption", () => {
    inBody(<BandRow colSpan={4}>Minerals</BandRow>);

    expect(screen.getByRole("cell", { name: "Minerals" })).toHaveAttribute(
      "colspan",
      "4",
    );
  });
});

describe("a row's drawer toggle", () => {
  it("says what pressing it will do and whether the drawer is open", () => {
    const { rerender } = render(
      <ExpandToggle
        isOpen={false}
        onToggle={() => {}}
        showLabel="Show Veldspar"
        hideLabel="Hide Veldspar"
      />,
    );

    expect(
      screen.getByRole("button", { name: "Show Veldspar" }),
    ).toHaveAttribute("aria-expanded", "false");

    rerender(
      <ExpandToggle
        isOpen
        onToggle={() => {}}
        showLabel="Show Veldspar"
        hideLabel="Hide Veldspar"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Hide Veldspar" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles without the click reaching the row beneath it", async () => {
    const onToggle = vi.fn();
    const onRowClick = vi.fn();
    inBody(
      <TableRow onClick={onRowClick}>
        <TableCell>
          <ExpandToggle
            isOpen={false}
            onToggle={onToggle}
            showLabel="Show"
            hideLabel="Hide"
          />
        </TableCell>
      </TableRow>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Show" }));

    expect(onToggle).toHaveBeenCalledOnce();
    expect(onRowClick).not.toHaveBeenCalled();
  });
});

describe("a row's drawer", () => {
  it("holds nothing while shut and its contents while open", () => {
    const { rerender } = inBody(
      <DrawerRow colSpan={3} isOpen={false}>
        Per batch
      </DrawerRow>,
    );

    expect(screen.queryByText("Per batch")).toBeNull();

    rerender(
      <Table>
        <TableBody>
          <DrawerRow colSpan={3} isOpen>
            Per batch
          </DrawerRow>
        </TableBody>
      </Table>,
    );
    expect(screen.getByText("Per batch")).toBeInTheDocument();
    expect(screen.getByRole("cell")).toHaveAttribute("colspan", "3");
  });
});

describe("a summing row", () => {
  const columns = [
    { id: "item", label: "Item" },
    { id: "quantity", label: "Quantity", align: "right" },
    { id: "value", label: "Value", align: "right" },
  ];

  it("puts its label first and each value under its column", () => {
    inBody(
      <SummaryRow
        columns={columns}
        label="Market value"
        values={{ value: "10,000.00" }}
      />,
    );

    expect(screen.getAllByRole("cell").map((cell) => cell.textContent)).toEqual(
      ["Market value", "", "10,000.00"],
    );
  });

  it("aligns each value the way its column asks", () => {
    inBody(
      <SummaryRow columns={columns} label="Total" values={{ quantity: 5 }} />,
    );

    expect(screen.getAllByRole("cell")[1]).toHaveStyle({ textAlign: "right" });
  });

  it("tones a value given as text as well as a number", () => {
    inBody(
      <SummaryRow
        columns={columns}
        label="Total"
        values={{ quantity: 5, value: "+1,000.00" }}
        tones={{ quantity: FIGURE_TONE.BAD, value: FIGURE_TONE.GOOD }}
      />,
    );

    const [, quantity, value] = screen.getAllByRole("cell");
    expect(quantity.firstChild.tagName).toBe("SPAN");
    expect(value.firstChild.tagName).toBe("SPAN");
    expect(getComputedStyle(value.firstChild).color).not.toBe(
      getComputedStyle(quantity.firstChild).color,
    );
  });
});
