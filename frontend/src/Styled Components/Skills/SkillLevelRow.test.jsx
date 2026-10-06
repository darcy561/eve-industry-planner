import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillLevelRow } from "./SkillLevelRow.jsx";

describe("a skill level row", () => {
  it("names the skill, says what it does here and shows its level", () => {
    render(
      <SkillLevelRow
        name="Simple Ore Processing"
        caption="Ore yield"
        level={3}
        value="3"
      />,
    );

    expect(screen.getByText("Simple Ore Processing")).toBeInTheDocument();
    expect(screen.getByText("Ore yield")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("offers its pips as the control when it can try another level", async () => {
    const onPropose = vi.fn();
    render(
      <SkillLevelRow
        name="Ice Processing"
        level={2}
        value="2"
        onPropose={onPropose}
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Ice Processing at level 4" }),
    );

    expect(onPropose).toHaveBeenCalledWith(4);
  });

  it("draws its pips as marks only when nothing can be tried", () => {
    render(<SkillLevelRow name="Reprocessing" level={5} value="5" />);

    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});
