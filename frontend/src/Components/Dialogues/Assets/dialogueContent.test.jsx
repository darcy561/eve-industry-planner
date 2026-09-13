import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const { store, characterRows, corporationRows, resolved } = vi.hoisted(() => ({
  store: {
    account: { characters: [], corporations: [], actions: {} },
    applicationSettings: {
      defaultStationIDForAssets: null,
      actions: { getCurrentLocale: () => "en-GB" },
    },
  },
  characterRows: new Map(),
  corporationRows: { current: [] },
  resolved: { current: {} },
}));

vi.mock("../../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../../tests/usersStoreHarness.js");
  return usersStoreMock(() => usersStoreState(store));
});

vi.mock("../../../Hooks/React Query/Character/assets", () => ({
  characterAssetsQueryKey: "characterAssets",
  characterAssetsQuery: (characterHash) => ({
    queryKey: ["characterAssets", characterHash],
    queryFn: async () => characterRows.get(characterHash) ?? [],
    enabled: true,
  }),
}));

vi.mock("../../../Hooks/React Query/Corporation/assets", () => ({
  corporationAssetsQueryKey: "corporationAssets",
  corporationAssetsQuery: () => ({
    queryKey: ["corporationAssets"],
    queryFn: async () => corporationRows.current,
    enabled: true,
  }),
}));

vi.mock("../../../Hooks/App/useCachedData", () => ({
  useCachedData: () => ({
    data: {
      34: { name: "Tritanium" },
      35: { name: "Pyerite" },
      3465: { name: "Large Secure Container" },
    },
    isLoading: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../../Functions/EveESI/World/nameLoader", () => ({
  // Anything these tests do not seed an answer for is a location ESI has no name for, which is a
  // settled answer rather than a failure to retry.
  requestName: async (id) =>
    resolved.current[id] ?? { id, resolutionStatus: "unnamed" },
}));

vi.mock("../../../Functions/EveESI/World/getAssetLocationNames", () => ({
  default: async () => new Map(),
}));

import AssetsDialogueContent from "./dialogueContent";
import {
  characterAssetRows,
  corporationAssetRows,
  JITA_STATION_ID,
} from "../../../tests/assetFixtures";

/** A second character holding the same material at the same station. */
const secondCharacterAssetRows = [
  {
    item_id: 8001,
    type_id: 34,
    quantity: 42,
    location_flag: "Hangar",
    location_id: JITA_STATION_ID,
    location_type: "station",
  },
];
import { EVERY_CHARACTER } from "../../Assets/assetScopePicker";
import { testQueryClientKeepingCache } from "../../../tests/queryClients.js";

const CHARACTER = {
  CharacterHash: "hash-a",
  CharacterID: 2114000001,
  CharacterName: "Reginal Shardani",
  corporation_id: 98000001,
};
const SECOND_CHARACTER = {
  CharacterHash: "hash-b",
  CharacterID: 2114000002,
  CharacterName: "Oijamon Hauler",
  corporation_id: 98000001,
};
const CORPORATION = {
  corporation_id: 98000001,
  corporationName: "Astral Acquisitions Inc.",
  // A corporation's assets are fanned out over the members whose roles can see them.
  members: ["hash-a"],
  hangars: [{ assetLocationRef: "CorpSAG1", name: "General" }],
};
const theme = createTheme();

function renderDialogue(scope = EVERY_CHARACTER, typeId = 34) {
  const actions = {
    resetState: vi.fn(),
    setScope: vi.fn(),
    setSelectedTypeID: vi.fn(),
    toggleIsOpen: vi.fn(),
  };
  const client = testQueryClientKeepingCache();

  render(
    <ThemeProvider theme={theme}>
      <QueryClientProvider client={client}>
        <AssetsDialogueContent
          state={{ isOpen: true, selectedTypeID: typeId, scope }}
          actions={actions}
        />
      </QueryClientProvider>
    </ThemeProvider>,
  );

  return actions;
}

beforeEach(() => {
  const characters = [CHARACTER, SECOND_CHARACTER];
  store.account = {
    characters,
    corporations: [CORPORATION],
    actions: {
      setCorporationOffices: vi.fn(),
      findCharacterByHash: (hash) =>
        characters.find((c) => c.CharacterHash === hash),
      getCorporation: () => CORPORATION,
    },
  };
  resolved.current = {
    [JITA_STATION_ID]: { id: JITA_STATION_ID, name: "Jita IV-4" },
  };
  characterRows.clear();
  characterRows.set("hash-a", characterAssetRows);
  characterRows.set("hash-b", secondCharacterAssetRows);
  corporationRows.current = corporationAssetRows;
});

describe("the assets dialogue", () => {
  it("names what is being looked for and where it is held", async () => {
    renderDialogue();

    expect(await screen.findByText("Where Tritanium is held")).toBeTruthy();
    expect(
      (await screen.findAllByText("Jita IV-4", {}, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);
  });

  // One control for both kinds of owner, in place of a character select beside a corporation
  // switch: the account-wide entry is what the switch could never offer.
  it("offers every character and every corporation from one control", async () => {
    const user = userEvent.setup();
    renderDialogue();

    await screen.findByText("Where Tritanium is held");
    await user.click(screen.getByRole("combobox"));

    expect(
      screen.getByRole("option", { name: "Every character" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /Reginal Shardani/ }),
    ).toBeTruthy();
    expect(
      screen.getByRole("option", { name: /Astral Acquisitions Inc./ }),
    ).toBeTruthy();
  });

  it("hands the chosen owner back as one value", async () => {
    const user = userEvent.setup();
    // The helper's name matches the rule's pattern, but what it hands back is the dialogue's
    // action spies rather than a render result.
    // eslint-disable-next-line testing-library/render-result-naming-convention
    const actions = renderDialogue();

    await screen.findByText("Where Tritanium is held");
    await user.click(screen.getByRole("combobox"));
    await user.click(
      screen.getByRole("option", { name: /Astral Acquisitions Inc./ }),
    );

    expect(actions.setScope).toHaveBeenCalledWith("corporation:98000001");
  });

  it("reads the corporation's own collection when one is chosen", async () => {
    renderDialogue("corporation:98000001");

    // 2003 is a stack of Tritanium in a crate in hangar division three.
    expect(
      await screen.findByText("Large Secure Container", {}, { timeout: 5000 }),
    ).toBeTruthy();
    expect(screen.getByText("250")).toBeTruthy();
  });

  it("says so when the owner holds none of it", async () => {
    renderDialogue(EVERY_CHARACTER, 999999);

    expect(await screen.findByText("Nothing held by this owner")).toBeTruthy();
  });

  // Every character's holdings merge into one collection, and nothing on an ESI asset row says
  // whose it is, so without the owner on the node the two stacks are indistinguishable.
  it("says which character holds each stack when every character is shown", async () => {
    renderDialogue();

    await screen.findAllByText("Jita IV-4", {}, { timeout: 5000 });

    expect(screen.getAllByTitle("Reginal Shardani").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Oijamon Hauler").length).toBeGreaterThan(0);
  });

  it("says nothing about the owner when only one is shown", async () => {
    renderDialogue("character:hash-a");

    await screen.findAllByText("Jita IV-4", {}, { timeout: 5000 });

    // The one portrait left is the picker's own: the stacks carry none, because the picker has
    // already said whose they are.
    expect(screen.getAllByTitle("Reginal Shardani")).toHaveLength(1);
  });
});
