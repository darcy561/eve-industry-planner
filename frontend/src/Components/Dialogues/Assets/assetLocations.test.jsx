import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock();
});

import AssetLocations_AssetDialogueWindow from "./assetLocations";
import buildAssetNodes from "../../../Functions/Assets/buildAssetNodes";
import assetsOfType from "../../../Functions/Assets/assetsOfType";
import { orderLocations } from "../../../Functions/Assets/assetTree";
import {
  characterAssetRows,
  corporationAssetRows,
  JITA_STATION_ID,
} from "../../../tests/assetFixtures";
import { seedItemRecords } from "../../../tests/seedItems";
import { testQueryClient } from "../../../tests/queryClients.js";

const itemRecords = {
  34: { name: "Tritanium" },
  36: { name: "Mexallon" },
  3465: { name: "Large Secure Container" },
};

function renderLocations(collection, typeId, extra = {}) {
  const locations = orderLocations(assetsOfType(collection, typeId), {
    [JITA_STATION_ID]: { name: "Jita IV-4" },
  });

  const queryClient = testQueryClient();
  seedItemRecords(queryClient, itemRecords);

  return render(
    <QueryClientProvider client={queryClient}>
      <AssetLocations_AssetDialogueWindow
        locations={locations.filter(
          ({ locationId }) => locationId === JITA_STATION_ID,
        )}
        {...extra}
      />
    </QueryClientProvider>,
  );
}

// The dialogue's rows were renamed onto the collection wholesale; a miss shows as a blank row.
describe("where a material is held", () => {
  it("names the location, the containers above the stack, and the stack itself", () => {
    renderLocations(buildAssetNodes(characterAssetRows), 36);

    expect(screen.getByText(/Jita IV-4/)).toBeTruthy();
    expect(screen.getAllByText("Large Secure Container")).toHaveLength(2);
    expect(screen.getByText("10")).toBeTruthy();
  });

  it("gives a container the name its owner gave it", () => {
    renderLocations(buildAssetNodes(characterAssetRows), 36, {
      containerNames: new Map([[1002, { name: "Ore Crate" }]]),
    });

    expect(screen.getByText("Large Secure Container - Ore Crate")).toBeTruthy();
  });

  it("names the hangar division a corporation's container sits in", () => {
    renderLocations(buildAssetNodes(corporationAssetRows), 34, {
      compartmentNames: new Map([["CorpSAG3", "Reactions"]]),
    });

    expect(screen.getByText("Reactions - Large Secure Container")).toBeTruthy();
    expect(screen.getByText("250")).toBeTruthy();
  });
});
