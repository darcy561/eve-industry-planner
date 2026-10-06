import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SelectableCard from "./SelectableCard";

const card = (props = {}) => (
  <SelectableCard
    selected={false}
    onSelect={() => {}}
    title="Local"
    body="Stores tokens in the browser."
    {...props}
  />
);

describe("SelectableCard", () => {
  it("states its title and body", () => {
    render(card());

    expect(screen.getByText("Local")).toBeInTheDocument();
    expect(
      screen.getByText("Stores tokens in the browser."),
    ).toBeInTheDocument();
  });

  it("is the control itself, so the hit area is what a reader sees", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(card({ onSelect }));

    await user.click(screen.getByRole("radio"));

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("says whether it is chosen", () => {
    render(card({ selected: true }));

    expect(screen.getByRole("radio")).toHaveAttribute("aria-checked", "true");
  });

  it("is reachable and usable from the keyboard", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(card({ onSelect }));

    await user.tab();
    expect(screen.getByRole("radio")).toHaveFocus();

    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it("cannot be chosen while disabled, by click or key", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(card({ onSelect, disabled: true }));

    const control = screen.getByRole("radio");
    await user.click(control).catch(() => {});
    control.focus();
    await user.keyboard("{Enter}");

    expect(onSelect).not.toHaveBeenCalled();
    expect(control).toHaveAttribute("aria-disabled", "true");
  });

  it("takes the role of an independent choice when asked", () => {
    render(card({ control: "checkbox" }));

    expect(screen.getByRole("checkbox")).toBeInTheDocument();
  });

  it("hides its inner input, because the card already carries the state", () => {
    const { container } = render(card({ selected: true }));

    expect(container.querySelector("input")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});

describe("a stacked SelectableCard", () => {
  it("sets its input beside the title, with the body beneath both", () => {
    render(card({ stacked: true }));

    const title = screen.getByText("Local");
    const body = screen.getByText("Stores tokens in the browser.");
    expect(title.parentElement).toContainElement(
      title.parentElement.querySelector("input"),
    );
    expect(title.parentElement).not.toContainElement(body);
  });
});
