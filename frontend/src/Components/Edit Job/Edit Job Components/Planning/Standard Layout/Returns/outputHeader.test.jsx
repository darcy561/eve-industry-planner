import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("../../../../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    account: { isLoggedIn: true },
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  });
});

const { default: OutputHeader } = await import("./outputHeader");

const show = (overrides = {}) =>
  render(
    <OutputHeader
      typeID={34}
      name="Tritanium"
      priceHubID="jita"
      unitPrice={200}
      quantityProduced={2}
      {...overrides}
    />,
  );

describe("what the job makes", () => {
  it("names the item and says what one is worth", () => {
    show();

    expect(screen.getByText("Tritanium")).toBeInTheDocument();
    expect(screen.getByText(/Making 2 · 200\.00 each/)).toBeInTheDocument();
  });

  // The name sits inside the market links' wrapper, which is inline-flex, and a
  // caption renders as a span — so without being told otherwise the two share a
  // line and the item's name runs into the price beside it.
  it("keeps the price on its own line rather than beside the name", () => {
    show();

    const priced = screen.getByText(/Making 2 · 200\.00 each/);

    expect(window.getComputedStyle(priced).display).toBe("block");
  });

  it("states the revenue the listing is worth", () => {
    show();

    expect(screen.getByText("Revenue, listed")).toBeInTheDocument();
    expect(screen.getByText("400.00")).toBeInTheDocument();
  });

  // Where the price came from is the "Selling from" box's to say, beside the
  // location it is about. Said here as well, it read as a contradiction of the
  // citadel named at the top of the same panel.
  it("leaves naming the price's hub to the sale location block", () => {
    show();

    expect(screen.getByText(/Making 2 · 200\.00 each/).textContent).not.toMatch(
      /priced from/,
    );
  });
});
