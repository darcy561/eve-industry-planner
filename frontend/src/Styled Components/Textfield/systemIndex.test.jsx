import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const world = { indexes: {} };

vi.mock("../../Zustand/usersStore", () => ({
  default: {
    getState: () => ({
      applicationSettings: {
        actions: { findPredefinedSystemIndex: () => null },
      },
      worldData: {
        actions: { findSystemIndex: (systemID) => world.indexes[systemID] },
      },
    }),
  },
}));

const { default: SystemIndexTextField } = await import("./systemIndex.jsx");

const JITA = 30000142;
const AMARR = 30002187;

function field() {
  return screen.getByLabelText("system-index-textfield").querySelector("input");
}

describe("the system index a setup is costed against", () => {
  it("shows the index of the system it was given", () => {
    world.indexes = { [JITA]: { manufacturing: 0.0125 } };

    render(<SystemIndexTextField inputSystemID={JITA} jobType={1} />);

    expect(field()).toHaveValue(1.25);
  });

  it("follows the system when the reader chooses another", () => {
    world.indexes = {
      [JITA]: { manufacturing: 0.0125 },
      [AMARR]: { manufacturing: 0.0631 },
    };

    const { rerender } = render(
      <SystemIndexTextField inputSystemID={JITA} jobType={1} />,
    );
    expect(field()).toHaveValue(1.25);

    rerender(<SystemIndexTextField inputSystemID={AMARR} jobType={1} />);

    expect(field()).toHaveValue(6.31);
  });

  it("shows nothing left over for a system the server has no index for", () => {
    world.indexes = { [JITA]: { manufacturing: 0.0125 } };

    const { rerender } = render(
      <SystemIndexTextField inputSystemID={JITA} jobType={1} />,
    );
    rerender(<SystemIndexTextField inputSystemID={30099999} jobType={1} />);

    expect(field()).toHaveValue(0);
  });

  it("shows the reader's own figure when they state one", () => {
    world.indexes = { [JITA]: { manufacturing: 0.0125 } };

    render(
      <SystemIndexTextField
        inputSystemID={JITA}
        jobType={1}
        useAlternativeSystemIndexValue
        alternativeSystemIndexValue={0.05}
      />,
    );

    expect(field()).toHaveValue(5);
  });

  it("carries a stated figure back without a hundredth of noise", () => {
    world.indexes = {};

    render(
      <SystemIndexTextField
        inputSystemID={JITA}
        jobType={1}
        useAlternativeSystemIndexValue
        alternativeSystemIndexValue={0.003}
      />,
    );

    expect(field()).toHaveValue(0.3);
  });
});
