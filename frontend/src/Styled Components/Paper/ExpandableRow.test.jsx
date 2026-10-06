import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import ExpandableRow from "./ExpandableRow";

const row = (props = {}) => (
  <ExpandableRow
    isOpen={false}
    onToggle={() => {}}
    showLabel="Show the setup"
    hideLabel="Hide the setup"
    drawer={<span>the editor</span>}
    {...props}
  >
    <span>714 runs</span>
  </ExpandableRow>
);

describe("ExpandableRow", () => {
  it("opens from a press anywhere on the row or on its chevron", () => {
    const onToggle = vi.fn();
    render(row({ onToggle }));

    fireEvent.click(screen.getByText("714 runs"));
    fireEvent.click(screen.getByRole("button", { name: "Show the setup" }));

    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it("does not open from a press on a control it carries", () => {
    const onToggle = vi.fn();
    render(row({ onToggle, actions: <button>Delete</button> }));

    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(onToggle).not.toHaveBeenCalled();
  });

  it("shows what it holds only while open, and says which way the chevron goes", () => {
    const { rerender } = render(row());
    expect(screen.queryByText("the editor")).toBeNull();

    rerender(row({ isOpen: true }));

    expect(screen.getByText("the editor")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Hide the setup" }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("offers no chevron and ignores presses on a row with nothing to open", () => {
    const onToggle = vi.fn();
    render(row({ onToggle, expandable: false }));

    fireEvent.click(screen.getByText("714 runs"));

    expect(screen.queryByRole("button")).toBeNull();
    expect(onToggle).not.toHaveBeenCalled();
  });
});
