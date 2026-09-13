import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import MarketGroupIcon from "./MarketGroupIcon";

// A market group's own icon names a file inside the game client, which nothing
// can serve — the image server carries types. So a group borrows one of its own
// items, and this is where that becomes a URL.
describe("the picture a market group is recognised by", () => {
  const avatar = (container) => container.querySelector(".MuiAvatar-root");

  it("asks the image server for the item the group borrows", () => {
    const { container } = render(<MarketGroupIcon typeID={34} />);

    // MUI mounts no <img> until the image loads, which jsdom never does, so the
    // request is read off the element rather than from a rendered image.
    expect(avatar(container)).toBeInTheDocument();
    expect(container.innerHTML).toContain("images.evetech.net/types/34/icon");
  });

  // Where a whole branch is obsolete there is no published item to borrow, and a
  // glyph is better than asking the server for a type that does not exist.
  it("asks for nothing when a group has nothing to borrow", () => {
    const { container } = render(<MarketGroupIcon />);

    expect(avatar(container)).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("images.evetech.net");
  });

  it("asks for a size the image server publishes", () => {
    const { container } = render(<MarketGroupIcon typeID={34} size={20} />);

    // 20 doubles to 40, and the server's next size up is 64.
    expect(container.innerHTML).toContain("size=64");
  });
});
