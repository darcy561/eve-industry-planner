import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../../../../../../Zustand/usersStore.js", async () => {
  const { usersStoreMock } =
    await import("../../../../../../tests/usersStoreHarness.js");
  return usersStoreMock({
    applicationSettings: {
      defaultPricing: {
        buying: { market: "jita", basis: "sell" },
        // Deliberately different: a fixture whose sides agree cannot tell a
        // surface asking for the wrong one.
        selling: { market: "amarr", basis: "buy" },
      },
    },
  });
});

const { default: RowPricingOverride } =
  await import("./rowPricingOverride.jsx");

function renderControl(props = {}) {
  render(
    <RowPricingOverride
      typeID={34}
      panelMarket="jita"
      panelListing="sell"
      onMarketCommit={() => {}}
      onListingCommit={() => {}}
      onReset={() => {}}
      {...props}
    />,
  );
}

describe("where a single material is priced", () => {
  it("offers a market and a listing to change", () => {
    renderControl();

    expect(screen.getByText("Market")).toBeInTheDocument();
    expect(screen.getByText("Listing")).toBeInTheDocument();
  });

  it("offers no way back while the row follows the panel", () => {
    // Nothing to undo, so an undo would be a control that does nothing.
    renderControl();

    expect(
      screen.queryByRole("button", { name: /use panel pricing/i }),
    ).toBeNull();
  });

  it("offers a way back once the row has its own hub", () => {
    renderControl({ overrideMarket: "amarr" });

    expect(
      screen.getByRole("button", { name: /use panel pricing/i }),
    ).toBeInTheDocument();
  });

  it("offers a way back once the row has its own basis", () => {
    renderControl({ overrideListing: "buyP95" });

    expect(
      screen.getByRole("button", { name: /use panel pricing/i }),
    ).toBeInTheDocument();
  });

  it("names the material when putting it back on the panel's basis", async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    renderControl({ overrideMarket: "amarr", onReset });

    await user.click(
      screen.getByRole("button", { name: /use panel pricing/i }),
    );

    expect(onReset).toHaveBeenCalledWith(34);
  });

  it("cannot be changed while the job is read only", () => {
    renderControl({ overrideMarket: "amarr", disabled: true });

    expect(
      screen.getByRole("button", { name: /use panel pricing/i }),
    ).toBeDisabled();
  });
});

describe("a locked job", () => {
  it("refuses a change to where the material is priced", () => {
    // The button being disabled is not enough: the selects are the controls
    // that write, and they were reachable while the job was locked.
    const { container } = render(
      <RowPricingOverride
        typeID={34}
        panelMarket="jita"
        panelListing="sell"
        onMarketCommit={() => {}}
        onListingCommit={() => {}}
        onReset={() => {}}
        disabled
      />,
    );

    const selects = container.querySelectorAll(
      ".Mui-disabled.MuiInputBase-root",
    );
    expect(selects.length).toBe(2);
  });
});
