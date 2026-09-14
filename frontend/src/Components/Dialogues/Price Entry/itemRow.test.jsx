import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { TRITANIUM } from "../../../tests/editJobFixtures.js";
import seedPrices, { clearSeededPrices } from "../../../tests/seedPrices.js";

const { store } = vi.hoisted(() => ({ store: { current: null } }));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store.current));
});

const { ItemPriceRow } = await import("./itemRow.jsx");

const theme = createTheme();

function pricedAt(sell) {
  clearSeededPrices();
  seedPrices({ jita: { [TRITANIUM]: { sell, buy: sell - 1 } } });
  store.current = {
    // Figures are formatted against the reader's locale.
    applicationSettings: { actions: { getCurrentLocale: () => "en-GB" } },
  };
}

/** An item on the price entry list, with whatever has already been priced. */
function item(totalQuantity, priceEntries = []) {
  return {
    typeID: TRITANIUM,
    name: "Tritanium",
    totalQuantity,
    remainingQuantity: totalQuantity,
    priceEntries,
  };
}

function pricedEntry(itemCount, itemCost) {
  return {
    id: `entry-${itemCount}-${itemCost}`,
    typeID: TRITANIUM,
    itemCount,
    itemCost,
  };
}

const setPriceEntryListData = vi.fn();

function row(listItem) {
  return (
    <ThemeProvider theme={theme}>
      <ItemPriceRow
        item={listItem}
        index={0}
        listingType="sell"
        marketLocation="jita"
        priceEntryListData={{ list: [listItem] }}
        setPriceEntryListData={setPriceEntryListData}
      />
    </ThemeProvider>
  );
}

function show(listItem) {
  return render(row(listItem));
}

function quantityFields() {
  return screen.queryAllByLabelText("Quantity");
}

function priceField() {
  return screen.getByLabelText("Price");
}

beforeEach(() => {
  vi.clearAllMocks();
  pricedAt(5);
});

describe("pricing one item", () => {
  it("offers a row for everything not yet priced, at the market price", () => {
    show(item(100));

    expect(quantityFields()).toHaveLength(1);
    expect(quantityFields()[0]).toHaveValue(100);
    expect(priceField()).toHaveValue(5);
  });

  it("keeps the price the reader types", () => {
    show(item(100));

    fireEvent.change(priceField(), { target: { value: "7" } });

    expect(priceField()).toHaveValue(7);
  });

  it("offers nothing once everything is priced", () => {
    show(item(100, [pricedEntry(100, 5)]));

    expect(quantityFields()).toHaveLength(0);
  });

  it("offers a row for what is left after some was priced", () => {
    show(item(100, [pricedEntry(40, 5)]));

    expect(quantityFields()[0]).toHaveValue(60);
  });

  // The list is rebuilt elsewhere — by Confirm All, or by pasting prices in —
  // and each row follows what that leaves it to do.
  it("takes its row away when the rest is priced elsewhere", () => {
    const listItem = item(100);
    const { rerender } = show(listItem);
    expect(quantityFields()).toHaveLength(1);

    rerender(row(item(100, [pricedEntry(100, 5)])));

    expect(quantityFields()).toHaveLength(0);
  });

  it("offers a row again when some of it is unpriced elsewhere", () => {
    const { rerender } = show(item(100, [pricedEntry(100, 5)]));
    expect(quantityFields()).toHaveLength(0);

    rerender(row(item(100, [pricedEntry(40, 5)])));

    expect(quantityFields()[0]).toHaveValue(60);
  });

  it("does not disturb the row the reader is filling in", () => {
    const listItem = item(100);
    const { rerender } = show(listItem);
    fireEvent.change(priceField(), { target: { value: "7" } });

    rerender(row(listItem));

    expect(priceField()).toHaveValue(7);
  });
});
