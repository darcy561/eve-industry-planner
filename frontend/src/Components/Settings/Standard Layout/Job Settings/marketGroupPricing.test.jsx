import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { testQueryClient } from "../../../../tests/queryClients.js";

const { store, tree, updateGroupPricingDefault } = vi.hoisted(() => {
  const updateGroupPricingDefault = vi.fn();
  return {
    updateGroupPricingDefault,
    store: {
      applicationSettings: {
        defaultPricing: {},
        actions: { updateGroupPricingDefault },
      },
    },
    tree: { current: {} },
  };
});

// The shared harness rather than a bare object: the row's save schedule reads
// `account`, and a mock carrying only what this panel touches breaks on the next
// module that reaches for a slice it did not model.
vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: tree.current,
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

const { default: MarketGroupPricing } = await import("./marketGroupPricing");

// Minerals sits inside a container, so a row has a path to state. The container
// is not called "Materials": that is the buying side's own heading, and a
// fixture sharing it could not tell a path from a section title.
const TREE = {
  1849: { name: "Manufacture & Research", children: [1857] },
  1857: { name: "Minerals", parent_id: 1849, has_types: true },
};

// The two sides carry different groups, so a section reading the wrong one is
// visible rather than passing on a fixture that agrees with itself.
function seed({ buying, selling } = {}) {
  store.applicationSettings.defaultPricing = {
    buying: { market: "jita", basis: "sell", groups: buying },
    selling: { market: "amarr", exit: "listed", groups: selling },
  };
  tree.current = TREE;
}

beforeEach(() => {
  updateGroupPricingDefault.mockClear();
});

const renderPanel = () =>
  render(
    <QueryClientProvider client={testQueryClient()}>
      <MarketGroupPricing />
    </QueryClientProvider>,
  );

describe("the market group pricing panel", () => {
  it("states a group's name and what it prices against", () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    expect(screen.getByText("Minerals")).toBeInTheDocument();
    // The choices are the selects' own values rather than text beside them.
    expect(screen.getByText("Hek")).toBeInTheDocument();
    expect(screen.getByText("Buy Orders")).toBeInTheDocument();
  });

  // The name alone does not say whether it is the group the reader meant, and a
  // default set on a container covers everything beneath it.
  it("states where the group sits", () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    expect(screen.getByText("Manufacture & Research")).toBeInTheDocument();
  });

  it("lists each side's own groups", () => {
    seed({
      buying: { 1857: { market: "hek", basis: "buy" } },
      selling: { 1849: { market: "dodixie" } },
    });
    renderPanel();

    expect(screen.getByText("Hek")).toBeInTheDocument();
    expect(screen.getByText("Dodixie")).toBeInTheDocument();
  });

  it("says a side has none rather than showing an empty box", () => {
    seed({ buying: { 1857: { market: "hek" } } });
    renderPanel();

    expect(screen.getByText(/Nothing set/)).toBeInTheDocument();
  });

  // A reader has to be able to see a choice in order to clear it, so a group the
  // published tree no longer carries is still a row.
  it("shows a group the tree no longer carries", () => {
    seed({ buying: { 99999: { market: "jita" } } });
    renderPanel();

    expect(screen.getByText("Group 99999")).toBeInTheDocument();
  });
});

// The store drops a group once it names nothing, so a row's controls and its
// remove are the same write reaching the same entry.
describe("changing what a group prices against", () => {
  it("writes the market to the side the row belongs to", async () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    const [market] = screen.getAllByRole("combobox");
    await userEvent.click(market);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText(/Jita/i),
    );

    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "buying",
      1857,
      "market",
      "jita",
    );
  });

  it("writes the basis without disturbing the market", async () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Sell Orders"),
    );

    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "buying",
      1857,
      "basis",
      "sell",
    );
  });

  it("writes to the side the row is under, not the first one", async () => {
    seed({ selling: { 1857: { market: "hek", exit: "listed" } } });
    renderPanel();

    const [market] = screen.getAllByRole("combobox");
    await userEvent.click(market);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText(/Jita/i),
    );

    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "selling",
      1857,
      "market",
      "jita",
    );
  });

  // Removing is clearing both fields: the store reads an entry naming nothing as
  // no entry, so there is no separate delete to get out of step with it.
  it("clears both fields to stop pricing a group separately", async () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /Remove/ }));

    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "buying",
      1857,
      "market",
      "",
    );
    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "buying",
      1857,
      "basis",
      "",
    );
  });
});

// A group answers its own side's axis. The selling side names how output leaves
// a build, so a group beneath it names a route rather than a basis its side no
// longer reads.
describe("what each side's groups answer", () => {
  it("offers the buying side a pricing basis", async () => {
    seed({ buying: { 1857: { market: "hek", basis: "buy" } } });
    renderPanel();

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    expect(
      within(screen.getByRole("listbox")).getByText("Sell Orders"),
    ).toBeInTheDocument();
  });

  it("offers the selling side a route out", async () => {
    seed({ selling: { 1857: { market: "hek", exit: "listed" } } });
    renderPanel();

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    expect(
      within(screen.getByRole("listbox")).getByText("Sell into buy orders"),
    ).toBeInTheDocument();
  });

  it("writes a route on the selling side", async () => {
    seed({ selling: { 1857: { market: "hek", exit: "listed" } } });
    renderPanel();

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Sell into buy orders"),
    );

    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "selling",
      1857,
      "exit",
      "immediate",
    );
  });

  // Removing has to clear the axis the side actually uses, or the entry keeps a
  // value and the group stays.
  it("clears the route when removing a selling group", async () => {
    seed({ selling: { 1857: { market: "hek", exit: "listed" } } });
    renderPanel();

    await userEvent.click(screen.getByRole("button", { name: /Remove/ }));

    expect(updateGroupPricingDefault).toHaveBeenCalledWith(
      "selling",
      1857,
      "exit",
      "",
    );
  });
});
