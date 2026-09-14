import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../IconButton/marketData", () => ({
  default: ({ side }) => (
    <button type="button" data-side={side}>
      Market data
    </button>
  ),
}));
vi.mock("../IconButton/marketHistory", () => ({
  default: ({ side }) => (
    <button type="button" data-side={side}>
      Price history
    </button>
  ),
}));
vi.mock("../IconButton/assets", () => ({
  default: () => <button type="button">Assets</button>,
}));

const loggedIn = { value: false };

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ account: { isLoggedIn: loggedIn.value } }),
  );
});

const { default: ItemMarketActions } = await import("./marketActions");

const renderRow = () =>
  render(
    <ItemMarketActions typeID={34} regionID="jita">
      <span>Tritanium</span>
    </ItemMarketActions>,
  );

describe("an item's market actions above its name", () => {
  it("offers nothing until the name is hovered", () => {
    renderRow();

    expect(screen.queryByText("Market data")).not.toBeInTheDocument();
  });

  it("offers all three to a signed-in player on hover", async () => {
    loggedIn.value = true;
    renderRow();

    await userEvent.hover(screen.getByText("Tritanium"));

    expect(await screen.findByText("Market data")).toBeInTheDocument();
    expect(screen.getByText("Price history")).toBeInTheDocument();
    expect(screen.getByText("Assets")).toBeInTheDocument();
    loggedIn.value = false;
  });

  // Assets are the player's own, so there is nothing to show when nobody is
  // signed in. The market pair is public and stays.
  it("drops the assets action when nobody is signed in", async () => {
    renderRow();

    await userEvent.hover(screen.getByText("Tritanium"));

    expect(await screen.findByText("Market data")).toBeInTheDocument();
    expect(screen.queryByText("Assets")).not.toBeInTheDocument();
  });

  it("takes the actions away once the pointer leaves", async () => {
    renderRow();
    const name = screen.getByText("Tritanium");

    await userEvent.hover(name);
    await screen.findByText("Market data");
    await userEvent.unhover(name);

    await waitFor(() =>
      expect(screen.queryByText("Market data")).not.toBeInTheDocument(),
    );
  });

  // Hover was the only way into the old popover, so these three had no route by
  // keyboard at all.
  it("opens when the name takes focus", async () => {
    renderRow();

    await userEvent.tab();

    expect(await screen.findByText("Market data")).toBeInTheDocument();
  });

  // A Popover is a Modal, and its invisible backdrop covers the viewport,
  // swallowing the pointer leave that should close this. Popper only positions.
  it("lays nothing over the page behind it", async () => {
    renderRow();

    await userEvent.hover(screen.getByText("Tritanium"));
    await screen.findByText("Market data");

    expect(document.querySelector(".MuiModal-root")).toBeNull();
    expect(document.querySelector(".MuiBackdrop-root")).toBeNull();
  });
});

describe("standing alone, with no name beside them", () => {
  it("shows the actions outright, with nothing to hover", () => {
    render(<ItemMarketActions typeID={34} />);

    expect(screen.getByText("Market data")).toBeInTheDocument();
    expect(screen.getByText("Price history")).toBeInTheDocument();
  });
});

// A link beside a sale price must not open the market the materials were bought
// on, so the side travels through to the buttons that resolve it.
describe("which side it is pricing", () => {
  it("passes the side through to the market links", () => {
    render(<ItemMarketActions typeID={34} side="selling" />);

    expect(screen.getByText("Market data")).toHaveAttribute(
      "data-side",
      "selling",
    );
  });

  it("prices the buying side unless told otherwise", () => {
    render(<ItemMarketActions typeID={34} />);

    expect(screen.getByText("Market data")).toHaveAttribute(
      "data-side",
      "buying",
    );
  });
});

// Reading through the selector rather than taking a snapshot is what lets the
// assets action appear when a player signs in without the page being rebuilt.
describe("following the account rather than sampling it", () => {
  it("offers assets once a signed-out reader signs in", () => {
    const { rerender } = render(<ItemMarketActions typeID={34} />);

    expect(screen.queryByText("Assets")).not.toBeInTheDocument();

    loggedIn.value = true;
    rerender(<ItemMarketActions typeID={34} />);

    expect(screen.getByText("Assets")).toBeInTheDocument();
    loggedIn.value = false;
  });
});
