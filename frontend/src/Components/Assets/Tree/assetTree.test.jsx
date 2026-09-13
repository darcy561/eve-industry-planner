import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AssetTree from "./assetTree";
import buildAssetNodes from "../../../Functions/Assets/buildAssetNodes";
import { assetRowsByLocation } from "../../../Functions/Assets/assetTree";
import { stubElementHeights } from "../../../tests/elementHeights";
import { seedItemRecords } from "../../../tests/seedItems";

const STATION_ID = 60003760;
const STACK_COUNT = 400;
const theme = createTheme();

const itemRecords = { 34: { name: "Tritanium" } };

const collection = buildAssetNodes(
  Array.from({ length: STACK_COUNT }, (unused, index) => ({
    item_id: 5000 + index,
    type_id: 34,
    quantity: index + 1,
    location_flag: "Hangar",
    location_id: STATION_ID,
    location_type: "station",
  })),
);

function renderTree(expanded) {
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

let restoreHeights;

beforeEach(() => {
  restoreHeights = stubElementHeights();
});

afterEach(() => restoreHeights?.());

describe("a location holding hundreds of stacks", () => {
  it("mounts only the rows near the viewport", () => {
    renderTree([`location:${STATION_ID}`]);

    const mounted = document.querySelectorAll("[data-index]").length;
    expect(mounted).toBeGreaterThan(0);
    expect(mounted).toBeLessThan(STACK_COUNT);
  });

  it("mounts one row while the location is closed", () => {
    renderTree([]);

    expect(document.querySelectorAll("[data-index]")).toHaveLength(1);
    expect(screen.getByText("Jita IV-4")).toBeTruthy();
  });
});
