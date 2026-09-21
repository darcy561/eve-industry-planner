import { describe, expect, it } from "vitest";
import { memo, useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";

import { renderCounts } from "./renderCounts.jsx";

const Panel = ({ label }) => <p>{label}</p>;

/** A page with one child that follows its parent and one that does not. */
function page(renders) {
  const Follows = renders.watch("follows", Panel);
  // Memoised outside the counter, so what is counted is the panel itself
  // rather than the wrapper in front of it.
  const Subscribed = memo(renders.watch("subscribed", Panel));

  return function Page() {
    const [value, setValue] = useState(0);
    return (
      <>
        <button onClick={() => setValue((held) => held + 1)}>move</button>
        <span>{value}</span>
        <Follows label="follows" />
        <Subscribed label="subscribed" />
      </>
    );
  };
}

describe("counting what re-renders", () => {
  it("counts each render a watched component does", () => {
    const renders = renderCounts();
    const Page = page(renders);

    render(<Page />);

    expect(renders.of("follows")).toBe(1);
    expect(renders.of("subscribed")).toBe(1);
  });

  it("answers zero for something never watched", () => {
    expect(renderCounts().of("absent")).toBe(0);
  });

  // The count a conversion is read against. A panel that re-renders itself off
  // what it reads has to be counted as re-rendering, or a selector subscribing
  // to the whole job reads the same as one that narrowed correctly.
  it("counts a panel that re-renders itself", () => {
    const renders = renderCounts();
    const Panel = renders.watch("panel", () => {
      const [value, setValue] = useState(0);
      return (
        <button onClick={() => setValue((held) => held + 1)}>{value}</button>
      );
    });

    render(<Panel />);
    renders.reset();
    fireEvent.click(screen.getByRole("button", { name: "0" }));

    expect(renders.of("panel")).toBe(1);
  });

  // What the helper is for, and the rule it measures: a child re-renders with
  // its parent whatever it reads, so holding a panel still takes more than
  // narrowing what it subscribes to.
  it("tells a child that follows its parent from one that does not", () => {
    const renders = renderCounts();
    const Page = page(renders);
    render(<Page />);

    renders.reset();
    fireEvent.click(screen.getByRole("button", { name: "move" }));

    expect(renders.of("follows")).toBe(1);
    expect(renders.of("subscribed")).toBe(0);
  });
});
