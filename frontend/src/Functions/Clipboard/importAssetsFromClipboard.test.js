import { describe, expect, it, vi } from "vitest";

vi.mock("../../Events/snackbarEvents", () => ({ showSnackbarError: vi.fn() }));
vi.mock("./clipboardPermissions", () => ({
  checkClipboardReadPermissions: vi.fn(),
}));
vi.mock("./readTextFromClipboard", () => ({ default: vi.fn() }));
vi.mock("../../Zustand/usersStore", () => ({ default: { getState: vi.fn() } }));

const { parseAssetsFromClipboardText } = await import(
  "./importAssetsFromClipboard"
);

describe("parseAssetsFromClipboardText", () => {
  it("reads lines with a single space between name and quantity", () => {
    expect(
      parseAssetsFromClipboardText(
        "Tritanium 36,481,215\nLiquid Ozone 2,692,948",
      ),
    ).toEqual({ Tritanium: 36481215, "Liquid Ozone": 2692948 });
  });

  it("reads tab-separated lines from the EVE inventory with extra columns", () => {
    expect(
      parseAssetsFromClipboardText(
        "Tritanium\t36,481,215\tMineral\t\t\t364,812.15 m3\r\nPyerite\t1,000",
      ),
    ).toEqual({ Tritanium: 36481215, Pyerite: 1000 });
  });

  it("keeps digits inside item names", () => {
    expect(
      parseAssetsFromClipboardText("100MN Afterburner II 5\nR.A.M.- Starship Tech 12"),
    ).toEqual({ "100MN Afterburner II": 5, "R.A.M.- Starship Tech": 12 });
  });

  it("sums repeated names", () => {
    expect(
      parseAssetsFromClipboardText("Tritanium 100\nTritanium\t50"),
    ).toEqual({ Tritanium: 150 });
  });

  it("skips lines without a quantity", () => {
    expect(
      parseAssetsFromClipboardText("Tritanium\n\nSome heading text\nPyerite 7"),
    ).toEqual({ Pyerite: 7 });
  });
});
