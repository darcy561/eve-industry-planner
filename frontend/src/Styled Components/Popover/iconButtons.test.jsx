import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("../IconButton/marketData", () => ({
  default: () => <button type="button">Market data</button>,
}));
vi.mock("../IconButton/marketHistory", () => ({
  default: () => <button type="button">Price history</button>,
}));
vi.mock("../IconButton/assets", () => ({
  default: () => <button type="button">Assets</button>,
}));

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({ account: { isLoggedIn: false } }),
  );
});

const { default: MaterialPopoverIconButtons } = await import("./iconButtons");

const renderPopover = () =>
  render(
    <MaterialPopoverIconButtons typeID={34} regionID="jita">
      <span>Tritanium</span>
    </MaterialPopoverIconButtons>,
  );

describe("the market options a row offers on hover", () => {
  it("opens on hover", async () => {
    renderPopover();

    await userEvent.hover(screen.getByText("Tritanium").parentElement);

    expect(await screen.findByText("Market data")).toBeInTheDocument();
  });

  // A Popover is a Modal, and a Modal lays an invisible backdrop over the whole
  // viewport. Left alone it swallows every pointer event on the page, so the
  // anchor never sees the pointer leave and nothing but a click closes this.
  it("lets pointer events through to the page beneath", async () => {
    const { container } = renderPopover();

    await userEvent.hover(screen.getByText("Tritanium").parentElement);
    await screen.findByText("Market data");

    const root = document.querySelector(".MuiPopover-root");
    expect(root).not.toBeNull();
    expect(getComputedStyle(root).pointerEvents).toBe("none");
    expect(container).toBeTruthy();
  });

  // The buttons are the point of it, so the paper has to take events back.
  it("keeps its own buttons clickable", async () => {
    renderPopover();

    await userEvent.hover(screen.getByText("Tritanium").parentElement);
    const paper = document.querySelector(".MuiPopover-paper");

    expect(getComputedStyle(paper).pointerEvents).toBe("auto");
  });

  it("closes once the pointer leaves", async () => {
    renderPopover();
    const anchor = screen.getByText("Tritanium").parentElement;

    await userEvent.hover(anchor);
    await screen.findByText("Market data");
    await userEvent.unhover(anchor);

    await waitFor(() =>
      expect(screen.queryByText("Market data")).not.toBeInTheDocument(),
    );
  });
});
