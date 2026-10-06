import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SegmentedChoice } from "./SegmentedChoice.jsx";

const OPTIONS = [
  { value: "prefer", label: "Prefer" },
  { value: "avoid", label: "Don't use", tooltip: "Leaves it out" },
];

function show(props = {}) {
  const onChange = vi.fn();
  render(
    <SegmentedChoice
      options={OPTIONS}
      value="prefer"
      onChange={onChange}
      label="Compressed ore"
      {...props}
    />,
  );
  return onChange;
}

describe("a segmented choice", () => {
  it("is a group named for what it chooses, with the chosen option pressed", () => {
    show();

    expect(
      screen.getByRole("group", { name: "Compressed ore" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Prefer" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hands back the option chosen", async () => {
    const onChange = show();

    await userEvent.click(screen.getByRole("button", { name: "Don't use" }));

    expect(onChange).toHaveBeenCalledWith("avoid");
  });

  it("keeps the chosen option when it is pressed again", async () => {
    const onChange = show();

    await userEvent.click(screen.getByRole("button", { name: "Prefer" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("can be named by a visible label instead", () => {
    render(
      <>
        <span id="ore-label">Ore choice</span>
        <SegmentedChoice
          options={OPTIONS}
          value="prefer"
          onChange={() => {}}
          labelledBy="ore-label"
        />
      </>,
    );

    expect(
      screen.getByRole("group", { name: "Ore choice" }),
    ).toBeInTheDocument();
  });

  it("keeps a button named by its label, its tooltip describing it", () => {
    show();

    expect(
      screen.getByRole("button", { name: "Don't use" }),
    ).toHaveAccessibleDescription("Leaves it out");
  });

  it("takes no choice while disabled", () => {
    show({ disabled: true });

    expect(screen.getByRole("button", { name: "Prefer" })).toBeDisabled();
  });

  it("shares the width between its buttons when stretched", () => {
    show({ stretch: true });

    expect(screen.getByRole("button", { name: "Prefer" })).toHaveStyle({
      flexGrow: "1",
    });
  });
});
