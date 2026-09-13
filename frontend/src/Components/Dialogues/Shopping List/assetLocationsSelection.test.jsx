import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

const { store } = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [] },
  },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

import SelectAssetLocation_ShoppingListDialogue from "./assetLocationsSelection";
import seedLocationNames from "../../../tests/seedLocationNames";
import { testQueryClient } from "../../../tests/queryClients.js";

const JITA = 60003760;
const SOTIYO = 1035466617947;

/** The locations already named when a test renders; an id left out is one still being asked about. */
let names = {};

function open(state = {}) {
  const user = userEvent.setup();
  const client = testQueryClient();
  seedLocationNames(client, names);
  render(
    <QueryClientProvider client={client}>
      <SelectAssetLocation_ShoppingListDialogue
        state={{
          assetType: "character",
          selectedCharacter: "main",
          selectedAssetLocation: "",
          assetLocations: [JITA, SOTIYO],
          ...state,
        }}
        actions={{
          setSelectedCharacter: () => {},
          setSelectedAssetLocation: () => {},
        }}
        assetLocationsLoading={false}
        assetLocationsError={false}
      />
    </QueryClientProvider>,
  );
  return user;
}

beforeEach(() => {
  store.account = {
    characters: [{ CharacterHash: "main", CharacterName: "Main" }],
    corporations: [],
  };
  names = {
    // Sorts after "No Access…" alphabetically, so the order below rests on the unreadable-last
    // rule rather than coinciding with it.
    [JITA]: "Zoohen VII",
    [SOTIYO]: {
      name: `No Access To Location - ${SOTIYO}`,
      resolutionStatus: "no_access",
    },
  };
});

describe("the asset locations a shopping list offers", () => {
  // The assets are in a structure the account cannot name; the reader is told that rather than
  // shown a blank row or nothing at all.
  it("names each location, and says which one it cannot read", async () => {
    const user = open();

    await user.click(screen.getAllByRole("combobox")[1]);

    expect(
      within(screen.getByRole("listbox"))
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Zoohen VII", `No Access To Location - ${SOTIYO}`]);
  });

  it("shows the chosen location rather than an empty box", () => {
    open({ selectedAssetLocation: SOTIYO });

    expect(screen.getAllByRole("combobox")[1].textContent).toBe(
      `No Access To Location - ${SOTIYO}`,
    );
  });
});
