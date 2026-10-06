import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import BottomSheet from "./BottomSheet";

describe("BottomSheet", () => {
  it("draws its title and what it holds while open, and nothing shut", async () => {
    const { rerender } = render(
      <BottomSheet open onClose={() => {}} title="714 runs × 1 slot">
        <span>the editor</span>
      </BottomSheet>,
    );

    expect(screen.getByText("714 runs × 1 slot")).toBeInTheDocument();
    expect(screen.getByText("the editor")).toBeInTheDocument();

    rerender(
      <BottomSheet open={false} onClose={() => {}}>
        <span>the editor</span>
      </BottomSheet>,
    );
    await vi.waitFor(() =>
      expect(screen.queryByText("the editor")).not.toBeInTheDocument(),
    );
  });

  it("closes when the reader taps outside it", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose}>
        <span>the editor</span>
      </BottomSheet>,
    );

    fireEvent.click(document.querySelector(".MuiBackdrop-root"));

    expect(onClose).toHaveBeenCalled();
  });
});
