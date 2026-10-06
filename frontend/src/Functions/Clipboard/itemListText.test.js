import { describe, expect, it } from "vitest";
import { itemListText } from "./itemListText";

describe("items as a list to paste into EVE", () => {
  it("puts a name and quantity on each line, each line ending in a newline", () => {
    expect(
      itemListText([
        { name: "Tritanium", quantity: 2000 },
        { name: "Pyerite", quantity: 50 },
      ]),
    ).toBe("Tritanium 2000\nPyerite 50\n");
  });

  it("is empty for no items", () => {
    expect(itemListText([])).toBe("");
  });
});
