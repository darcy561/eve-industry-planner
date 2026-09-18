import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActionMenu from "./ActionMenu";

describe("an action menu", () => {
  it("offers its actions under a button naming what they act on", async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <ActionMenu
        label="Oswold Saraki actions"
        items={[{ label: "Renew ESI access", onClick }]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Oswold Saraki actions" }),
    );
    await user.click(screen.getByRole("menuitem", { name: /renew esi/i }));

    expect(onClick).toHaveBeenCalled();
  });

  // A disabled item takes no pointer events, so a tooltip carrying the reason would never open and
  // the control would be indistinguishable from a broken one.
  it("says why an action it cannot run yet is inert", async () => {
    const user = userEvent.setup();
    render(
      <ActionMenu
        label="Oswold Saraki actions"
        items={[
          {
            label: "Leave planner",
            disabled: true,
            disabledReason: "Waiting on an invite API",
          },
        ]}
      />,
    );

    await user.click(screen.getByRole("button"));

    expect(screen.getByText("Waiting on an invite API")).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: /leave planner/i }),
    ).toHaveAttribute("aria-disabled", "true");
  });

  // Two rows on one roster each carry a menu; shared ids would have the second labelling the first.
  it("gives each menu its own ids", () => {
    render(
      <>
        <ActionMenu label="first" items={[{ label: "a" }]} />
        <ActionMenu label="second" items={[{ label: "a" }]} />
      </>,
    );

    const [first, second] = screen.getAllByRole("button");
    expect(first.id).not.toBe(second.id);
  });

  it("draws nothing when there is nothing to offer", () => {
    render(<ActionMenu label="empty" items={[]} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
