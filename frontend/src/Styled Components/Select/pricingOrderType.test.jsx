import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import PricingOrderTypeSelect from "./pricingOrderType";

const formatValue = (value) => `${value} ISK`;

const options = [
  { id: "buy", label: "Buy Orders", total: 100, delta: -50, isCurrent: false },
  { id: "sell", label: "Sell Orders", total: 150, delta: 0, isCurrent: true },
  {
    id: "buyP95",
    label: "Buy Orders (95th %ile)",
    total: 120,
    delta: -30,
    isCurrent: false,
  },
  {
    id: "sellP05",
    label: "Sell Orders (5th %ile)",
    total: 140,
    delta: -10,
    isCurrent: false,
  },
];

async function open(props = {}) {
  const user = userEvent.setup();
  render(
    <PricingOrderTypeSelect
      options={options}
      formatValue={formatValue}
      onChange={() => {}}
      {...props}
    />,
  );
  await user.click(screen.getByRole("button"));
  return user;
}

describe("PricingOrderTypeSelect", () => {
  it("shows the order type in effect without opening", () => {
    render(
      <PricingOrderTypeSelect
        options={options}
        formatValue={formatValue}
        onChange={() => {}}
      />,
    );

    expect(screen.getByRole("button")).toHaveTextContent("Sell Orders");
  });

  it("offers every order type with what each one costs", async () => {
    await open();

    const items = screen.getAllByRole("option");
    expect(items).toHaveLength(options.length);
    options.forEach((option, index) => {
      expect(within(items[index]).getByText(option.label)).toBeInTheDocument();
      expect(
        within(items[index]).getByText(`${option.total} ISK`),
      ).toBeInTheDocument();
    });
  });

  it("marks the order type in effect as selected", async () => {
    await open();

    const items = screen.getAllByRole("option");
    expect(items[1]).toHaveAttribute("aria-selected", "true");
    expect(items[0]).toHaveAttribute("aria-selected", "false");
  });

  it("shows how far each other order type sits from the one in effect", async () => {
    await open();

    const buyP95 = screen.getAllByRole("option")[2];
    expect(within(buyP95).getByText("−30 ISK")).toBeInTheDocument();
  });

  it("shows no delta against the order type already in effect", async () => {
    await open();

    const sell = screen.getAllByRole("option")[1];
    expect(within(sell).queryByText(/ISK/)).toHaveTextContent("150 ISK");
    expect(within(sell).queryByText(/^[+−]/)).toBeNull();
  });

  it("reports the order type a player picks", async () => {
    const onChange = vi.fn();
    const user = await open({ onChange });

    await user.click(screen.getAllByRole("option")[2]);

    expect(onChange).toHaveBeenCalledWith("buyP95");
  });

  it("does not report a change when the order type in effect is picked again", async () => {
    const onChange = vi.fn();
    const user = await open({ onChange });

    await user.click(screen.getAllByRole("option")[1]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it("renders nothing when there are no bases to offer", () => {
    const { container } = render(
      <PricingOrderTypeSelect
        options={[]}
        formatValue={formatValue}
        onChange={() => {}}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});

describe("what each order type means", () => {
  const explained = options.map((option, index) => ({
    ...option,
    caption: `caption ${index}`,
    description: `what mode ${index} does`,
  }));

  it("says what each one does, because the names alone are jargon", async () => {
    await open({ options: explained });

    expect(screen.getByText("what mode 0 does")).toBeInTheDocument();
    expect(screen.getByText("caption 0")).toBeInTheDocument();
  });

  it("still lists an order type that carries no explanation", async () => {
    await open();

    expect(screen.getAllByRole("option")).toHaveLength(options.length);
  });
});

describe("rows that are not on this order type", () => {
  it("counts them, so an override is visible without opening a dialogue", async () => {
    await open({ usage: { overridden: 2, purchased: 3 } });

    expect(screen.getByText("2 overridden · 3 purchased")).toBeInTheDocument();
  });

  it("counts only what there is", async () => {
    await open({ usage: { overridden: 0, purchased: 3 } });

    expect(screen.getByText("3 purchased")).toBeInTheDocument();
  });

  it("says nothing when every row is on the order type", async () => {
    await open({ usage: { overridden: 0, purchased: 0 } });

    expect(screen.queryByText(/overridden|purchased/)).toBeNull();
  });

  it("offers to put overridden rows back", async () => {
    const onReset = vi.fn();
    const user = await open({
      usage: { overridden: 2, purchased: 0 },
      onReset,
    });

    await user.click(screen.getByRole("button", { name: /reset overrides/i }));

    expect(onReset).toHaveBeenCalledOnce();
  });

  it("does not offer a reset when nothing is overridden", async () => {
    await open({ usage: { overridden: 0, purchased: 3 }, onReset: () => {} });

    expect(
      screen.queryByRole("button", { name: /reset overrides/i }),
    ).toBeNull();
  });
});
