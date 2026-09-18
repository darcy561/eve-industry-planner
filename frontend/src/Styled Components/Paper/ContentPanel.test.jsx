import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ContentPanel from "./ContentPanel";

const rulesFor = (element) => {
  const generated = [...element.classList].find((name) =>
    name.startsWith("css-"),
  );
  const sheet = [...document.querySelectorAll("style")]
    .map((tag) => tag.textContent)
    .join("");

  return sheet
    .split(`.${generated}{`)
    .slice(1)
    .map((part) => part.slice(0, part.indexOf("}")))
    .filter(Boolean);
};

describe("the panel every page's content sits in", () => {
  it("shows what it was given", () => {
    render(
      <ContentPanel componentName="Test">
        <p>Inside</p>
      </ContentPanel>,
    );

    expect(document.body).toHaveTextContent("Inside");
  });

  // By the time the page shell and the step rail have taken theirs, a fixed
  // 16px each side is most of a narrow viewport's remaining room — and the
  // tables inside run out of width before the panel does.
  it("gives back some of its padding where width is scarce", () => {
    const { container } = render(
      <ContentPanel componentName="Test">
        <p>Inside</p>
      </ContentPanel>,
    );

    const paddings = rulesFor(container.firstChild)
      .map((rule) => /padding:\s*(\d+)px/.exec(rule)?.[1])
      .filter(Boolean)
      .map(Number);

    expect(paddings.length).toBeGreaterThan(1);
    expect(Math.min(...paddings)).toBeLessThan(Math.max(...paddings));
  });
  // Two panels carrying a menu appear on one page, and the button and its list are wired to each
  // other by id. Ids minted per instance are what keeps the second panel's button from claiming
  // the first panel's list.
  it("gives each panel's menu its own identity", async () => {
    const chosen = vi.fn();

    render(
      <>
        <ContentPanel
          componentName="Test"
          title="Setups"
          enableMenu
          menuItems={[{ label: "Add setup", onClick: chosen }]}
        >
          <p>One</p>
        </ContentPanel>
        <ContentPanel
          componentName="Test"
          title="Transactions"
          enableMenu
          menuItems={[{ label: "Link a sale" }]}
        >
          <p>Two</p>
        </ContentPanel>
      </>,
    );

    const first = screen.getByRole("button", { name: "Setups actions" });
    const second = screen.getByRole("button", { name: "Transactions actions" });
    expect(first.id).not.toBe(second.id);

    await userEvent.click(first);
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Add setup" }),
    );
    expect(chosen).toHaveBeenCalledTimes(1);
  });
});
