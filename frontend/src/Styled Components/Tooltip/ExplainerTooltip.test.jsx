import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "@mui/material";

import ExplainerTooltip from "./ExplainerTooltip";

describe("explaining what a control does", () => {
  it("shows what the control does on hover", async () => {
    render(
      <ExplainerTooltip title="Clears every row's own market">
        <Button>Reset overrides</Button>
      </ExplainerTooltip>,
    );

    await userEvent.hover(screen.getByRole("button"));

    expect(
      await screen.findByText("Clears every row's own market"),
    ).toBeInTheDocument();
  });

  // MUI attaches its listeners to the child, and a disabled button fires none —
  // so without the span a reader cannot find out why it is disabled, which is
  // the state most in need of an explanation.
  it("still explains a disabled control", async () => {
    render(
      <ExplainerTooltip title="Nothing to reset">
        <Button disabled>Reset overrides</Button>
      </ExplainerTooltip>,
    );

    await userEvent.hover(screen.getByRole("button").parentElement);

    expect(await screen.findByText("Nothing to reset")).toBeInTheDocument();
  });

  // A caller whose title is empty in some states should not have to branch, and
  // an empty tooltip should cost nothing rather than render a bare arrow.
  it("renders the control alone when there is nothing to say", () => {
    const { container } = render(
      <ExplainerTooltip title="">
        <Button>Reset overrides</Button>
      </ExplainerTooltip>,
    );

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(container.querySelector("span")).toBeNull();
  });

  it("keeps the control working", async () => {
    const onClick = vi.fn();
    render(
      <ExplainerTooltip title="Does a thing">
        <Button onClick={onClick}>Press</Button>
      </ExplainerTooltip>,
    );

    await userEvent.click(screen.getByRole("button"));

    expect(onClick).toHaveBeenCalled();
  });

  // MUI clones the child's props onto the wrapper, so a child carrying its own
  // aria-label ends up announced twice — once on each. Handing the tooltip
  // straight to the child leaves one labelled element.
  it("states a labelled child's name once when it takes the listeners itself", () => {
    render(
      <ExplainerTooltip title="Manufacturing Job Linked" wrap={false}>
        <span aria-label="Manufacturing Job Linked">
          <svg />
        </span>
      </ExplainerTooltip>,
    );

    expect(screen.getAllByLabelText("Manufacturing Job Linked")).toHaveLength(
      1,
    );
  });
});
