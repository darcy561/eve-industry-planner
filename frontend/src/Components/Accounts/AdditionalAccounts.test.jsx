import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { AdditionalAccounts } from "./AdditionalAccounts";
import { testQueryClient } from "../../tests/queryClients.js";

const setCloudAccountsEnabled = vi.fn();
const addCharacter = vi.fn();
const upsertCloudStoredEsiRefreshTokens = vi.fn(async () => true);
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
      applicationSettings: {
        userCloudAccounts: cloudAccounts,
        actions: { setCloudAccountsEnabled },
      },
    }),
  );
});

vi.mock(
  "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js",
  () => ({
    upsertCloudStoredEsiRefreshTokens: (...args) =>
      upsertCloudStoredEsiRefreshTokens(...args),
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
    setCloudAccountsEnabled.mockClear();
    upsertCloudStoredEsiRefreshTokens.mockClear();
    updateLocalRefreshTokens.mockClear();
  });

  it("lists the linked characters and not the main one", () => {
    characters = [
      aCharacter({
        CharacterHash: "main",
        CharacterName: "Main Character",
        isMainCharacter: true,
      }),
      aCharacter({ CharacterName: "Linked Alt" }),
    ];
    renderAccounts();

    expect(screen.getByText("Linked Alt")).toBeInTheDocument();
    expect(screen.queryByText("Main Character")).not.toBeInTheDocument();
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

describe("where linked character tokens are kept", () => {
  beforeEach(() => {
    characters = [
      aCharacter({ CharacterHash: "main", isMainCharacter: true }),
      aCharacter(),
    ];
    cloudAccounts = false;
    setCloudAccountsEnabled.mockClear();
    upsertCloudStoredEsiRefreshTokens.mockClear();
    updateLocalRefreshTokens.mockClear();
    window.localStorage.clear();
  });

  it("says which of the two a reader is on", () => {
    renderAccounts();

    const local = screen.getByRole("radio", { name: /local/i });
    expect(local).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: /cloud/i })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("moves the stored tokens to the cloud when asked", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "main-hash AdditionalAccounts",
      JSON.stringify([{ CharacterHash: "hash-1", rToken: "token-1" }]),
    );
    renderAccounts();

    await user.click(screen.getByRole("radio", { name: /cloud/i }));

    await waitFor(() => {
      expect(upsertCloudStoredEsiRefreshTokens).toHaveBeenCalledWith([
        { CharacterHash: "hash-1", rToken: "token-1" },
      ]);
    });
    expect(setCloudAccountsEnabled).toHaveBeenCalledWith(true);
    // What was moved is not left behind in the browser as well.
    expect(
      window.localStorage.getItem("main-hash AdditionalAccounts"),
    ).toBeNull();
  });

  it("writes the tokens back to the browser when leaving the cloud", async () => {
    const user = userEvent.setup();
    cloudAccounts = true;
    renderAccounts();

    await user.click(screen.getByRole("radio", { name: /local/i }));

    await waitFor(() => {
      expect(setCloudAccountsEnabled).toHaveBeenCalledWith(false);
    });
    expect(updateLocalRefreshTokens).toHaveBeenCalled();
  });

  it("does nothing when the mode chosen is the one already set", async () => {
    const user = userEvent.setup();
    renderAccounts();

    await user.click(screen.getByRole("radio", { name: /local/i }));

    expect(setCloudAccountsEnabled).not.toHaveBeenCalled();
    expect(upsertCloudStoredEsiRefreshTokens).not.toHaveBeenCalled();
  });
});
