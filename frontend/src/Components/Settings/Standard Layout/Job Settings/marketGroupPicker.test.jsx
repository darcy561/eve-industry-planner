import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../../../tests/queryClients.js";
import { stubElementHeights } from "../../../../tests/elementHeights";

const { tree, walks } = vi.hoisted(() => ({
  tree: { current: {} },
  walks: { count: 0 },
}));

vi.mock("../../../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: tree.current,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

// The walk every group goes through to build the search — the cost this dialogue
// must not pay while it is shut.
vi.mock(
  "../../../../Functions/MarketData/marketGroupData",
  async (original) => {
    const actual = await original();
    return {
      ...actual,
      ancestorPathIn: (...args) => {
        walks.count += 1;
        return actual.ancestorPathIn(...args);
      },
    };
  },
);

const { default: MarketGroupPicker } = await import("./marketGroupPicker");

// jsdom measures every element at zero, which leaves the virtualised listbox
// deciding one row is enough to render.
let restoreHeights;
beforeEach(() => {
  restoreHeights = stubElementHeights();
});
afterEach(() => restoreHeights?.());

// Two roots, one of which holds a branch, so a drill has somewhere to go and the
// breadcrumb has something to climb back through.
const TREE = {
  1849: { name: "Manufacture & Research", children: [1857] },
  1857: {
    name: "Minerals",
    parent_id: 1849,
    children: [1998],
    has_types: true,
  },
  1998: { name: "Tritanium Grades", parent_id: 1857, has_types: true },
  4: { name: "Ammunition", has_types: true },
};

function renderPicker(onChoose = vi.fn()) {
  tree.current = TREE;
  const result = render(
    <QueryClientProvider client={testQueryClient()}>
      <MarketGroupPicker
        open
        onClose={vi.fn()}
        onChoose={onChoose}
        noun="Materials"
      />
    </QueryClientProvider>,
  );
  return Object.assign(result, { onChoose });
}

describe("choosing a market group", () => {
  it("opens on the roots", () => {
    renderPicker();

    expect(screen.getByText("Ammunition")).toBeInTheDocument();
    expect(screen.getByText("Manufacture & Research")).toBeInTheDocument();
    // Not a root, so it should not be offered until the reader drills in.
    expect(screen.queryByText("Minerals")).not.toBeInTheDocument();
  });

  it("opens a group that has something under it", async () => {
    renderPicker();

    await userEvent.click(screen.getByText("Manufacture & Research"));

    expect(screen.getByText("Minerals")).toBeInTheDocument();
  });

  it("chooses a group that has nothing under it", async () => {
    const { onChoose } = renderPicker();

    await userEvent.click(screen.getByText("Ammunition"));

    expect(onChoose).toHaveBeenCalledWith(4);
  });

  // A default set on a container covers everything beneath it, which is the
  // whole reason the rung walks ancestors — so a reader must not have to reach a
  // leaf to price a branch.
  it("chooses the level the reader is standing on", async () => {
    const { onChoose } = renderPicker();

    await userEvent.click(screen.getByText("Manufacture & Research"));
    await userEvent.click(screen.getByText(/and everything under it/));

    expect(onChoose).toHaveBeenCalledWith(1849);
  });

  it("climbs back out through the breadcrumb", async () => {
    renderPicker();

    await userEvent.click(screen.getByText("Manufacture & Research"));
    await userEvent.click(screen.getByText("All groups"));

    expect(screen.getByText("Ammunition")).toBeInTheDocument();
  });

  // A reader who knows the name should not have to browse to it.
  it("finds a group by name, wherever it sits", async () => {
    const { onChoose } = renderPicker();

    await userEvent.type(screen.getByLabelText("Search a group"), "Tritanium");
    // By role: the listbox is virtualised, so only what is on screen is mounted.
    await userEvent.click(
      await screen.findByRole("option", { name: /Tritanium Grades/ }),
    );

    expect(onChoose).toHaveBeenCalledWith(1998);
  });

  it("says which groups hold items directly", async () => {
    renderPicker();

    expect(screen.getAllByText("Holds items").length).toBeGreaterThan(0);
  });
});

// The shell renders nothing until it is open, and the body walks every one of
// two thousand groups to build its search. Doing that in the frame holding the
// open flag would cost it on every render of a settings page carrying two of
// these, shut.
describe("what the picker costs while it is shut", () => {
  it("builds nothing until it is opened", () => {
    tree.current = TREE;
    walks.count = 0;

    render(
      <QueryClientProvider client={testQueryClient()}>
        <MarketGroupPicker
          open={false}
          onClose={vi.fn()}
          onChoose={vi.fn()}
          noun="Materials"
        />
      </QueryClientProvider>,
    );

    // Not one group walked: the body that walks them is not mounted at all.
    expect(walks.count).toBe(0);
    expect(screen.queryByLabelText("Search a group")).not.toBeInTheDocument();
  });

  it("mounts the body once it is open", () => {
    renderPicker();

    expect(screen.getByLabelText("Search a group")).toBeInTheDocument();
  });

  // The shell unmounts the body on close, so a reader who browsed into a branch
  // and closed opens again at the roots.
  it("opens at the roots after browsing and closing", async () => {
    tree.current = TREE;
    const { rerender } = render(
      <QueryClientProvider client={testQueryClient()}>
        <MarketGroupPicker
          open
          onClose={vi.fn()}
          onChoose={vi.fn()}
          noun="Materials"
        />
      </QueryClientProvider>,
    );

    await userEvent.click(screen.getByText("Manufacture & Research"));
    expect(screen.getByText("Minerals")).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={testQueryClient()}>
        <MarketGroupPicker
          open={false}
          onClose={vi.fn()}
          onChoose={vi.fn()}
          noun="Materials"
        />
      </QueryClientProvider>,
    );
    rerender(
      <QueryClientProvider client={testQueryClient()}>
        <MarketGroupPicker
          open
          onClose={vi.fn()}
          onChoose={vi.fn()}
          noun="Materials"
        />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Ammunition")).toBeInTheDocument();
    expect(screen.queryByText("Minerals")).not.toBeInTheDocument();
  });
});

// A row does two different things depending on what is under the group, and the
// row itself cannot show which.
describe("what a picker row says it will do", () => {
  it("says a group with children opens rather than being chosen", async () => {
    renderPicker();

    await userEvent.hover(screen.getByText("Manufacture & Research"));

    expect(await screen.findByText(/Opens this group/)).toBeInTheDocument();
  });

  it("says a group with nothing under it is priced", async () => {
    renderPicker();

    await userEvent.hover(screen.getByText("Ammunition"));

    expect(await screen.findByText("Prices this group")).toBeInTheDocument();
  });
});
