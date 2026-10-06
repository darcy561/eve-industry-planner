import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "@mui/material";
import { ChipRow } from "./ChipRow.jsx";

describe("a row of chips", () => {
  it("holds its chips on a row that wraps", () => {
    render(
      <ChipRow>
        <Chip label="Veldspar" />
        <Chip label="Scordite" />
      </ChipRow>,
    );

    const row = screen.getByText("Veldspar").closest(".MuiStack-root");
    expect(row).toHaveStyle({ flexWrap: "wrap" });
    expect(screen.getByText("Scordite")).toBeInTheDocument();
  });

  it("is a named group when given a label", () => {
    render(
      <ChipRow label="Never choose">
        <Chip label="Veldspar" />
      </ChipRow>,
    );

    expect(
      screen.getByRole("group", { name: "Never choose" }),
    ).toBeInTheDocument();
  });
});
