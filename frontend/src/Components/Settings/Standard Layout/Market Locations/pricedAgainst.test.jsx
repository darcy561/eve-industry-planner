import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const updatePricingDefault = vi.fn();
// The sides differ deliberately: a fixture whose sides agree cannot tell a
// control reading the wrong one.
let defaultPricing = {
  buying: { market: "jita", orderType: "sell" },
  selling: { market: "amarr", exit: "immediate" },
};

vi.mock("../../../../Zustand/usersStore", () => ({
  default: (selector) =>
    selector({
      applicationSettings: {
        defaultPricing,
        actions: { updatePricingDefault },
      },
    }),
}));

vi.mock(
  "../../../../Functions/Debounce/userDocumentsPersistSchedule.js",
  () => ({ scheduleDebouncedApplicationSettingsSave: vi.fn() }),
);

// The picker offers whatever the registry carries; the hubs are enough here.
vi.mock("../../../../Hooks/Static/useMarketSources", () => ({
  useMarketSources: () => [
    { id: "jita", name: "Jita", kind: "hub" },
    { id: "amarr", name: "Amarr", kind: "hub" },
    { id: "hek", name: "Hek", kind: "hub" },
  ],
}));

const { default: PricedAgainst } = await import("./pricedAgainst.jsx");

beforeEach(() => {
  vi.clearAllMocks();
  defaultPricing = {
    buying: { market: "jita", orderType: "sell" },
    selling: { market: "amarr", exit: "immediate" },
  };
});

// A reader buys materials in one place and lists what they made in another as a
// matter of course, so the two are asked separately.
describe("which market the account buys and sells at", () => {
  it("offers a market for each side", () => {
    render(<PricedAgainst />);

    expect(screen.getByText("Materials market")).toBeInTheDocument();
    expect(screen.getByText("Output market")).toBeInTheDocument();
  });

  it("shows each side its own stored choice", () => {
    render(<PricedAgainst />);

    expect(screen.getByText("Jita")).toBeInTheDocument();
    expect(screen.getByText("Amarr")).toBeInTheDocument();
  });

  it("writes the buying side's market", async () => {
    render(<PricedAgainst />);

    await userEvent.click(screen.getAllByRole("combobox")[0]);
    await userEvent.click(within(screen.getByRole("listbox")).getByText("Hek"));

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "buying",
      "market",
      "hek",
    );
  });

  it("writes the selling side's market", async () => {
    render(<PricedAgainst />);

    await userEvent.click(screen.getAllByRole("combobox")[2]);
    await userEvent.click(within(screen.getByRole("listbox")).getByText("Hek"));

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "selling",
      "market",
      "hek",
    );
  });

  // A market that has been removed, or that an organisation stopped sharing,
  // leaves the stored choice naming nothing. The select shows the hub taking
  // over rather than an empty box.
  it("shows the hub when the chosen market is no longer saved", () => {
    defaultPricing = {
      buying: { market: "gone" },
      selling: { market: "gone" },
    };

    render(<PricedAgainst />);

    expect(screen.getAllByText("Jita")).toHaveLength(2);
  });
});

// Which market a side prices at and which figure it reads there are one choice,
// so both are asked here rather than a tab apart.
describe("which figure each side reads", () => {
  it("offers the axis each side answers", () => {
    render(<PricedAgainst />);

    expect(screen.getByText("Materials prices")).toBeInTheDocument();
    expect(screen.getByText("Output sold by")).toBeInTheDocument();
  });

  it("shows each side its own stored choice", () => {
    render(<PricedAgainst />);

    expect(screen.getByText("Sell Orders")).toBeInTheDocument();
    // The selling side states its route out, not an order type.
    expect(screen.getByText("Sell into buy orders")).toBeInTheDocument();
  });

  it("writes the buying side's order type", async () => {
    render(<PricedAgainst />);

    await userEvent.click(screen.getAllByRole("combobox")[1]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("Buy Orders"),
    );

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "buying",
      "orderType",
      "buy",
    );
  });

  it("writes the selling side's route out", async () => {
    render(<PricedAgainst />);

    await userEvent.click(screen.getAllByRole("combobox")[3]);
    await userEvent.click(
      within(screen.getByRole("listbox")).getByText("List on the market"),
    );

    expect(updatePricingDefault).toHaveBeenCalledWith(
      "selling",
      "exit",
      "listed",
    );
  });
});
