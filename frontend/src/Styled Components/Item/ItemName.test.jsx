import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./marketActions", () => ({
  default: ({ children, typeID, regionID }) => (
    <span data-type={typeID} data-region={regionID}>
      {children}
    </span>
  ),
}));
vi.mock("../Avatar/EveImageAvatar", () => ({
  default: ({ type }) => <img alt="" data-type={type} />,
}));

const { ItemName } = await import("./ItemName");

describe("an item named in a table row", () => {
  it("names the item with its market actions for that type and market", () => {
    render(<ItemName typeID="1230" name="Veldspar" regionID="jita" />);

    const actions = screen.getByText("Veldspar").parentElement;
    expect(actions).toHaveAttribute("data-type", "1230");
    expect(actions).toHaveAttribute("data-region", "jita");
  });

  it("shows the item's icon by its type", () => {
    const { container } = render(<ItemName typeID="1230" name="Veldspar" />);

    expect(container.querySelector("img")).toHaveAttribute("data-type", "1230");
  });

  it("says what kind of item it is beneath the name only when given", () => {
    const { rerender } = render(<ItemName typeID={34} name="Tritanium" />);
    expect(screen.queryByText("Mineral")).toBeNull();

    rerender(<ItemName typeID={34} name="Tritanium" caption="Mineral" />);
    expect(screen.getByText("Mineral")).toBeInTheDocument();
  });
});
