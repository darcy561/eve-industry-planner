import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SkillLevelPips from "./SkillLevelPips";

const fillsOf = (container) =>
  [...container.querySelectorAll("[data-fill]")].map((el) =>
    el.getAttribute("data-fill"),
  );

const renderPips = (props = {}) =>
  render(<SkillLevelPips level={3} name="Industry" {...props} />);

describe("skill level pips", () => {
  it("offers one mark per level", () => {
    renderPips({ onPropose: vi.fn() });

    for (const level of [1, 2, 3, 4, 5]) {
      expect(
        screen.getByLabelText(`Industry at level ${level}`),
      ).toBeInTheDocument();
    }
  });

  it("asks for the level whose mark was clicked", async () => {
    const onPropose = vi.fn();
    renderPips({ onPropose });

    await userEvent.click(screen.getByLabelText("Industry at level 5"));

    expect(onPropose).toHaveBeenCalledWith(5);
  });

  it("puts the question back when the current level is clicked", async () => {
    const onPropose = vi.fn();
    renderPips({ onPropose });

    await userEvent.click(screen.getByLabelText("Industry at level 3"));

    expect(onPropose).toHaveBeenCalledWith(null);
  });

  it("withdraws against the level being tried, not the trained one", async () => {
    const onPropose = vi.fn();
    renderPips({ proposed: 5, onPropose });

    await userEvent.click(screen.getByLabelText("Industry at level 5"));

    expect(onPropose).toHaveBeenCalledWith(null);
  });

  it("marks the levels a lower proposal gives up", () => {
    const { container } = renderPips({ level: 5, proposed: 2 });

    expect(fillsOf(container)).toEqual([
      "trained",
      "trained",
      "surrendered",
      "surrendered",
      "surrendered",
    ]);
  });

  it("marks the levels a higher proposal would add", () => {
    const { container } = renderPips({ level: 2, proposed: 5 });

    expect(fillsOf(container)).toEqual([
      "trained",
      "trained",
      "proposed",
      "proposed",
      "proposed",
    ]);
  });

  it("marks the gap a requirement leaves", () => {
    const { container } = renderPips({ level: 2, required: 4 });

    expect(fillsOf(container)).toEqual([
      "trained",
      "trained",
      "short",
      "short",
      "empty",
    ]);
  });
});
