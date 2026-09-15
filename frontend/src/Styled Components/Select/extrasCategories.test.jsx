import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const categories = vi.hoisted(() => ({ current: [] }));

vi.mock("../../Hooks/React Query/plannerSettings.js", () => ({
  usePlannerExtrasCategories: () => ({
    categories: categories.current,
    isHeld: true,
  }),
}));

const { default: ExtrasCategoriesSelect } = await import("./extrasCategories");

// The control is described by its helper text rather than labelled by it, so
// there is one combobox to find and no accessible name to find it by.
const open = async (user) => user.click(screen.getByRole("combobox"));

describe("choosing the category a cost is filed under", () => {
  it("offers the planner's categories and not its deleted ones", async () => {
    categories.current = [
      { id: "0", label: "Unassigned" },
      { id: "courier", label: "Courier" },
      { id: "gone", label: "Retired", deleted: true },
    ];
    const user = userEvent.setup();
    render(<ExtrasCategoriesSelect value="0" onChange={() => {}} />);

    await open(user);

    expect(screen.getByRole("option", { name: "Courier" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Retired" })).toBeNull();
  });

  it("hands back the category id that was chosen", async () => {
    categories.current = [
      { id: "0", label: "Unassigned" },
      { id: "courier", label: "Courier" },
    ];
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ExtrasCategoriesSelect value="0" onChange={onChange} />);

    await open(user);
    await user.click(screen.getByRole("option", { name: "Courier" }));

    expect(onChange).toHaveBeenCalledWith("courier");
  });
});
