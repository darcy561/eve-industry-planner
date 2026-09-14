import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ActionCard from "./ActionCard";

describe("ActionCard", () => {
  it("states its title and what it says", () => {
    render(<ActionCard title="Discord">Community chat.</ActionCard>);

    expect(screen.getByText("Discord")).toBeInTheDocument();
    expect(screen.getByText("Community chat.")).toBeInTheDocument();
  });

  it("is a link when given somewhere to go, and says it leaves the app", () => {
    render(<ActionCard title="GitHub" href="https://example.com/repo" />);

    const link = screen.getByRole("link", {
      name: "GitHub (opens in a new tab)",
    });
    expect(link).toHaveAttribute("href", "https://example.com/repo");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", expect.stringContaining("noreferrer"));
  });

  it("is a button when given something to do", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<ActionCard title="Feedback" onAction={onAction} />);

    await user.click(
      screen.getByRole("button", { name: "Feedback (opens dialogue)" }),
    );

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("reaches the button by keyboard, so a pointer is not the only way in", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(<ActionCard title="Feedback" onAction={onAction} />);

    screen.getByRole("button", { name: "Feedback (opens dialogue)" }).focus();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");

    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("announces no role when there is nothing to do, so it is not a dead control", () => {
    render(<ActionCard title="Wiki (coming soon)">Not ready yet.</ActionCard>);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Wiki (coming soon)")).toBeInTheDocument();
  });

  it("prefers the link when given both, because following it is the plainer act", async () => {
    const onAction = vi.fn();
    const user = userEvent.setup();
    render(
      <ActionCard
        title="Both"
        href="https://example.com"
        onAction={onAction}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Both (opens in a new tab)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();

    await user.click(screen.getByRole("link"));
    expect(onAction).not.toHaveBeenCalled();
  });

  it("dims an inert card whose action this deployment has not configured", () => {
    const { container } = render(<ActionCard title="Forum" muted />);

    expect(container.firstChild).toHaveStyle({ opacity: "0.72" });
  });

  it("never dims a card that still acts, so muted cannot hide a live control", () => {
    const { container } = render(
      <ActionCard title="Forum" href="https://example.com" muted />,
    );

    expect(container.firstChild).not.toHaveStyle({ opacity: "0.72" });
  });

  it("shows its icon beside the text", () => {
    render(
      <ActionCard title="Discord" icon={<span data-testid="mark">x</span>} />,
    );

    expect(screen.getByTestId("mark")).toBeInTheDocument();
  });

  it("carries no bookend when there is no icon", () => {
    const { container } = render(<ActionCard title="Plain" />);

    expect(container.querySelector("hr")).not.toBeInTheDocument();
  });
});
