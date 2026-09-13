import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssetTree from "./assetTree";
import { assetRowHeight } from "./assetTreeRow";
import { ASSET_ROW } from "../../../Functions/Assets/flattenAssetTree";
import buildAssetNodes from "../../../Functions/Assets/buildAssetNodes";
import { assetRowsByLocation } from "../../../Functions/Assets/assetTree";
import { stubElementHeights } from "../../../tests/elementHeights";
import { seedItemRecords } from "../../../tests/seedItems";

const STATION_ID = 60003760;
const theme = createTheme();
const itemRecords = { 34: { name: "Tritanium" } };

const collection = buildAssetNodes(
  Array.from({ length: 12 }, (unused, index) => ({
    item_id: 5000 + index,
    type_id: 34,
    quantity: index + 1,
    location_flag: "Hangar",
    location_id: STATION_ID,
    location_type: "station",
  })),
);

function renderTree(expanded = []) {
  const rows = assetRowsByLocation(collection).get(STATION_ID);

  const queryClient = new QueryClient();
  seedItemRecords(queryClient, itemRecords);

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <AssetTree
          locations={[{ locationId: STATION_ID, name: "Jita IV-4", rows }]}
          byItemId={collection.byItemId}
          containerNames={new Map()}
          expanded={new Set(expanded)}
          onToggle={() => {}}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** The wrappers the virtualiser positions, in the order it placed them. */
function placedRows(container) {
  return [...container.querySelectorAll("[data-index]")];
}

let restoreHeights;

beforeEach(() => {
  restoreHeights = stubElementHeights();
});

afterEach(() => restoreHeights?.());

describe("how the asset tree lays its rows out", () => {
  // Nothing here can see a row overflowing its slot — jsdom lays nothing out —
  // so the constraint is stated instead. A row is positioned by the height it
  // claims and nothing clips the difference, so one that renders taller sits on
  // top of the row beneath it. The expander is the tallest thing a row holds.
  it("never declares a row shorter than the expander it holds", () => {
    const EXPANDER_HEIGHT = 30;

    for (const kind of Object.values(ASSET_ROW)) {
      expect(assetRowHeight(kind, true)).toBeGreaterThanOrEqual(
        EXPANDER_HEIGHT,
      );
      expect(assetRowHeight(kind, false)).toBeGreaterThanOrEqual(
        EXPANDER_HEIGHT,
      );
    }
  });

  it("scrolls within itself rather than moving the page", () => {
    const { container } = renderTree();

    expect(container.firstChild).toHaveStyle({ overflowY: "auto" });
  });

  // Every row holds one line that never wraps, so its height follows from its
  // kind. Nothing mounts to be measured, which is what lets the virtualiser
  // place a row it has not drawn yet.
  it("gives a row the height its kind says, without measuring it", () => {
    const { container } = renderTree([`location:${STATION_ID}`]);
    const placed = placedRows(container);

    expect(placed.length).toBeGreaterThan(1);
    for (const row of placed) {
      expect(row.style.height).not.toBe("");
      expect(Number.parseInt(row.style.height, 10)).toBeGreaterThan(0);
    }
  });

  it("stacks each row directly below the one before it", () => {
    const { container } = renderTree([`location:${STATION_ID}`]);
    const placed = placedRows(container);

    const offsets = placed.map((row) =>
      Number.parseInt(row.style.transform.replace(/\D+(\d+).*/, "$1"), 10),
    );
    const heights = placed.map((row) => Number.parseInt(row.style.height, 10));

    for (let i = 1; i < offsets.length; i += 1) {
      expect(offsets[i]).toBe(offsets[i - 1] + heights[i - 1]);
    }
  });

  it("asks for no more rows than the expansion calls for", () => {
    const { container } = renderTree();

    // Collapsed, a location is one row however much it holds.
    expect(placedRows(container)).toHaveLength(1);
  });

  it("gives a location row a different height from a stack", () => {
    const { container } = renderTree([`location:${STATION_ID}`]);
    const [locationRow, firstItemRow] = placedRows(container);

    expect(Number.parseInt(locationRow.style.height, 10)).not.toBe(
      Number.parseInt(firstItemRow.style.height, 10),
    );
  });
});
