import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";

const { store, setOffices, imperativeFetch } = vi.hoisted(() => ({
  store: {},
  setOffices: vi.fn(),
  imperativeFetch: vi.fn(),
}));

vi.mock("../../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

// The path this hook used to take: names fetched outside a render and written into the store by
// hand, while the office picker resolved the very same ids again.
vi.mock("../../../../Hooks/React Query/World/names", () => ({
  fetchNames: (...args) => imperativeFetch(...args),
}));

import { useShoppingListCorporationAssets } from "./useShoppingListCorporationAssets";

const CORPORATION = 98000001;
const MEMBER = "hash-a";
const JITA = 60003760;
const RAITARU = 1035466617946;
const TRITANIUM = 34;
const PYERITE = 35;

/** An office folder at a place, and one stack of something filed in a hangar division inside it. */
function office(
  itemId,
  locationId,
  { typeId, quantity, division = "CorpSAG1" },
) {
  return [
    {
      item_id: itemId,
      type_id: 27,
      quantity: 1,
      location_flag: "OfficeFolder",
      location_id: locationId,
      location_type: "item",
    },
    {
      item_id: itemId + 1,
      type_id: typeId,
      quantity,
      location_flag: division,
      location_id: itemId,
      location_type: "item",
      is_singleton: false,
    },
  ];
}

const rows = [
  ...office(9001, JITA, { typeId: TRITANIUM, quantity: 100 }),
  ...office(9003, RAITARU, { typeId: PYERITE, quantity: 7 }),
];

/** The shopping list as this hook uses it. */
function shoppingList() {
  return {
    clearAssetQuantities: vi.fn(),
    calculateVisibleItems: vi.fn(),
    calculateTotalVolume: vi.fn(),
    calculateTotalValue: vi.fn(),
  };
}

function render({
  office: selectedOffice = null,
  hangar = null,
  ...rest
} = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["corporationAssets", MEMBER], rows);

  const actions = {
    setIsLoading: vi.fn(),
    applyAssetsFromMap: vi.fn(),
  };
  const list = shoppingList();
  const view = renderHook(
    () =>
      useShoppingListCorporationAssets({
        state: {
          assetType: "corporation",
          selectedCorporation: CORPORATION,
          selectedCorporationOffice: selectedOffice,
          selectedCorporationHangar: hangar,
          shoppingList: list,
          buildingShoppingList: false,
          isLoading: false,
          ...rest,
        },
        actions,
        corporationAssetsLoading: false,
      }),
    {
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { ...view, actions, list };
}

/** The same hook, with the office the reader chose free to change between renders. */
function renderChangingOffice(firstOffice) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(["corporationAssets", MEMBER], rows);

  const actions = { setIsLoading: vi.fn(), applyAssetsFromMap: vi.fn() };
  const list = shoppingList();
  const view = renderHook(
    (selectedOffice) =>
      useShoppingListCorporationAssets({
        state: {
          assetType: "corporation",
          selectedCorporation: CORPORATION,
          selectedCorporationOffice: selectedOffice,
          selectedCorporationHangar: "CorpSAG1",
          shoppingList: list,
          buildingShoppingList: false,
          isLoading: false,
        },
        actions,
        corporationAssetsLoading: false,
      }),
    {
      initialProps: firstOffice,
      wrapper: ({ children }) =>
        createElement(QueryClientProvider, { client }, children),
    },
  );
  return { ...view, actions, list };
}

beforeEach(() => {
  setOffices.mockReset();
  imperativeFetch.mockReset();
  store.account = {
    characters: [{ CharacterHash: MEMBER }],
    corporations: [
      { corporation_id: CORPORATION, members: [MEMBER], officeLocations: [] },
    ],
    actions: {
      setCorporationOffices: setOffices,
      getCorporation: () => ({
        corporation_id: CORPORATION,
        members: [MEMBER],
      }),
    },
  };
});

describe("the offices a corporation's assets say it rents", () => {
  it("reads them by the same rule the rest of the app uses", async () => {
    render();

    await waitFor(() => expect(setOffices).toHaveBeenCalled());
    expect(setOffices.mock.calls[0][0]).toBe(CORPORATION);
    expect([...setOffices.mock.calls[0][1]].sort((a, b) => a - b)).toEqual(
      [JITA, RAITARU].sort((a, b) => a - b),
    );
  });

  // The office picker resolves its own names from the shared cache. Fetching them here as well
  // resolved every office twice.
  it("resolves no names of its own", async () => {
    render();

    await waitFor(() => expect(setOffices).toHaveBeenCalled());
    expect(imperativeFetch).not.toHaveBeenCalled();
  });
});

describe("what a corporation's assets put on the shopping list", () => {
  it("counts only what is in the chosen office and division", async () => {
    const { actions } = render({ office: JITA, hangar: "CorpSAG1" });

    await waitFor(() => expect(actions.applyAssetsFromMap).toHaveBeenCalled());
    const applied = actions.applyAssetsFromMap.mock.calls.at(-1)[0];
    expect([...applied.keys()]).toEqual([TRITANIUM]);
  });

  // The other office holds a different item; choosing it must not carry the first one over.
  it("counts the other office's contents when that one is chosen", async () => {
    const { actions } = render({ office: RAITARU, hangar: "CorpSAG1" });

    await waitFor(() => expect(actions.applyAssetsFromMap).toHaveBeenCalled());
    const applied = actions.applyAssetsFromMap.mock.calls.at(-1)[0];
    expect([...applied.keys()]).toEqual([PYERITE]);
  });

  it("counts nothing from a division the corporation does not fill", async () => {
    const { actions } = render({ office: JITA, hangar: "CorpSAG4" });

    await waitFor(() => expect(actions.applyAssetsFromMap).toHaveBeenCalled());
    expect(actions.applyAssetsFromMap.mock.calls.at(-1)[0].size).toBe(0);
  });

  // The reader changing office must not leave the previous office's items counted. The list is
  // cleared on three different paths on the way here, so this asserts what a reader would see —
  // what ends up applied — rather than that any particular clear happened.
  it("counts only the new office after the reader changes office", async () => {
    const { rerender, actions } = renderChangingOffice(JITA);

    await waitFor(() => expect(actions.applyAssetsFromMap).toHaveBeenCalled());
    expect([...actions.applyAssetsFromMap.mock.calls.at(-1)[0].keys()]).toEqual(
      [TRITANIUM],
    );

    rerender(RAITARU);

    await waitFor(() =>
      expect([
        ...actions.applyAssetsFromMap.mock.calls.at(-1)[0].keys(),
      ]).toEqual([PYERITE]),
    );
  });

  it("leaves a list alone while it is still being built", async () => {
    const { actions } = render({
      office: JITA,
      hangar: "CorpSAG1",
      buildingShoppingList: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actions.applyAssetsFromMap).not.toHaveBeenCalled();
  });

  it("leaves a list alone when the reader is counting their own assets", async () => {
    const { actions } = render({
      office: JITA,
      hangar: "CorpSAG1",
      assetType: "character",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(actions.applyAssetsFromMap).not.toHaveBeenCalled();
    expect(setOffices).not.toHaveBeenCalled();
  });
});
