import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { AdditionalAccounts } from "./AdditionalAccounts";
import { testQueryClient } from "../../tests/queryClients.js";

const addCharacter = vi.fn();
const updateLocalRefreshTokens = vi.fn();

let characters = [];
let cloudAccounts = false;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters,
        actions: {
          addCharacter,
          removeCharacter: vi.fn(),
          removeCharacterFromCorporations: vi.fn(),
          getCorporation: () => null,
          getMainCharacterHash: () => "main-hash",
        },
      },
      applicationSettings: { userCloudAccounts: cloudAccounts },
    }),
  );
});

vi.mock(
  "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js",
  () => ({
    upsertCloudStoredEsiRefreshTokens: vi.fn(async () => true),
    deleteCloudStoredEsiRefreshTokens: vi.fn(async () => true),
  }),
);

// The component imports this module both with and without the extension, and
// Vitest keys a mock by the specifier, so both spellings need one. The factories
// are hoisted above every declaration in this file, so each builds its own.
vi.mock("../../Functions/Auth/buildAccountData", () => ({
  getLocalAdditionalAccountsStorageKey: () => "main-hash AdditionalAccounts",
  updateLocalRefreshTokens: (...args) => updateLocalRefreshTokens(...args),
}));
vi.mock("../../Functions/Auth/buildAccountData.js", () => ({
  getLocalAdditionalAccountsStorageKey: () => "main-hash AdditionalAccounts",
  updateLocalRefreshTokens: (...args) => updateLocalRefreshTokens(...args),
}));

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: vi.fn(),
  flushPendingUserDocumentSaves: vi.fn(async () => {}),
}));

vi.mock("../../Functions/Auth/refreshAccountSessionGrants.js", () => ({
  default: vi.fn(async () => {}),
}));

function aCharacter(overrides = {}) {
  return {
    CharacterID: 2114794365,
    CharacterName: "Oswold Saraki",
    CharacterHash: "hash-1",
    isMainCharacter: false,
    esiRefreshToken: "token-1",
    ...overrides,
  };
}

function renderAccounts() {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <AdditionalAccounts />
    </QueryClientProvider>,
  );
}

describe("the characters linked to an account", () => {
  beforeEach(() => {
    characters = [
      aCharacter({ CharacterHash: "main", isMainCharacter: true }),
      aCharacter(),
    ];
    cloudAccounts = false;
    updateLocalRefreshTokens.mockClear();
  });

  // One roster, one row shape. The main character is a character, and a reader who has learnt the
  // list should not have to learn a second treatment for the one at the top of it.
  it("lists every character, the main one first and marked", () => {
    characters = [
      aCharacter({ CharacterName: "Linked Alt" }),
      aCharacter({
        CharacterHash: "main",
        CharacterName: "Main Character",
        isMainCharacter: true,
      }),
    ];
    renderAccounts();

    const named = screen
      .getAllByText(/Main Character|Linked Alt/)
      .map((node) => node.textContent);

    expect(named).toEqual(["Main Character", "Linked Alt"]);
    expect(screen.getByText("main")).toBeInTheDocument();
  });

  it("offers a way to link another character", () => {
    renderAccounts();

    expect(
      screen.getByRole("button", { name: /add account/i }),
    ).toBeInTheDocument();
  });

  it("shows an account with nothing linked to it", () => {
    characters = [aCharacter({ CharacterHash: "main", isMainCharacter: true })];
    renderAccounts();

    expect(
      screen.getByRole("button", { name: /add account/i }),
    ).toBeInTheDocument();
  });
});

describe("how the roster is laid out", () => {
  beforeEach(() => {
    characters = [
      aCharacter({ CharacterHash: "main", isMainCharacter: true }),
      aCharacter(),
    ];
  });

  // First login shows the main character on its own card above this roster, so the roster there is
  // the characters linked to it.
  it("leaves the main character out where it is already shown beside the roster", () => {
    characters = [
      aCharacter({
        CharacterHash: "main",
        CharacterName: "Main Character",
        isMainCharacter: true,
      }),
      aCharacter({ CharacterName: "Linked Alt" }),
    ];
    render(
      <QueryClientProvider client={testQueryClient()}>
        <AdditionalAccounts includeMainCharacter={false} />
      </QueryClientProvider>,
    );

    expect(screen.getByText("Linked Alt")).toBeInTheDocument();
    expect(screen.queryByText("Main Character")).not.toBeInTheDocument();
  });

  // The roster was a grid of content-sized cards, so a row that opened its ESI data reflowed the
  // rest and characters moved past each other. jsdom runs no layout, so the guard is the container
  // itself: a column cannot reflow, and this fails if the rows go back into a grid.
  it("lays the roster out as a column", () => {
    characters = [
      aCharacter({ CharacterHash: "alt-1", CharacterName: "Linked Alt" }),
      aCharacter({ CharacterHash: "alt-2", CharacterName: "Second Alt" }),
    ];
    renderAccounts();

    const roster = screen
      .getByText("Linked Alt")
      .closest(".MuiPaper-root").parentElement;
    const layout = getComputedStyle(roster);

    expect(layout.display).toBe("flex");
    expect(layout.flexDirection).toBe("column");
  });

  it("keeps the roster in order when a row opens its ESI data", async () => {
    const user = userEvent.setup();
    characters = [
      aCharacter({
        CharacterHash: "main",
        CharacterName: "Main Character",
        isMainCharacter: true,
      }),
      aCharacter({ CharacterHash: "alt-1", CharacterName: "Linked Alt" }),
      aCharacter({ CharacterHash: "alt-2", CharacterName: "Second Alt" }),
    ];
    renderAccounts();

    const order = () =>
      screen
        .getAllByText(/Main Character|Linked Alt|Second Alt/)
        .map((node) => node.textContent);
    const before = order();

    await user.click(screen.getAllByRole("button", { name: "ESI data" })[1]);

    expect(order()).toEqual(before);
    expect(screen.getByText("Character Skills")).toBeInTheDocument();
  });
});
