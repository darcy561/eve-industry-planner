import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import EntityRow from "./EntityRow";

describe("a row for something the account holds", () => {
  it("puts the pieces where the page's other lists put them", () => {
    render(
      <EntityRow
        avatar={<img alt="Oswold Saraki portrait" src="portrait.png" />}
        name="Oswold Saraki"
        context={<span>Hard Knocks Inc.</span>}
        status={<span>ESI connected</span>}
        actions={<button type="button">Oswold Saraki actions</button>}
      >
        <p>ESI data</p>
      </EntityRow>,
    );

    expect(screen.getByAltText("Oswold Saraki portrait")).toBeInTheDocument();
    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
    expect(screen.getByText("ESI connected")).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.getByText("ESI data")).toBeInTheDocument();
  });

  it("draws a row with nothing but a name", () => {
    render(<EntityRow name="My planner" />);

    expect(screen.getByText("My planner")).toBeInTheDocument();
  });

  // The planner being worked in is marked by the row itself, so a list does not need a second way
  // of saying which one is chosen.
  it("marks the one being worked in", () => {
    const { container, rerender } = render(<EntityRow name="My planner" />);
    const plain = container.querySelector(".MuiPaper-root").className;

    rerender(<EntityRow name="My planner" selected />);

    expect(container.querySelector(".MuiPaper-root").className).not.toBe(plain);
  });

  it("keeps a long name on one line", () => {
    render(<EntityRow name="A Very Long Character Name Indeed" />);

    expect(screen.getByText("A Very Long Character Name Indeed")).toHaveClass(
      "MuiTypography-noWrap",
    );
  });
});
