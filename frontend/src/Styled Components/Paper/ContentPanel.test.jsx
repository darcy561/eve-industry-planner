import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

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
});
