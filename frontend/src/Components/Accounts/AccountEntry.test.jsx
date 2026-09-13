import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

import { AccountEntry } from "./AccountEntry";
import { testQueryClient } from "../../tests/queryClients.js";

const removeCharacter = vi.fn();
const removeCharacterFromCorporations = vi.fn();
const deleteCloudStoredEsiRefreshTokens = vi.fn(async () => true);
const updateLocalRefreshTokens = vi.fn();

let corporation = null;
let cloudAccounts = false;

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } = await import(
    "../../tests/usersStoreHarness.js"
  );
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters: [],
        actions: {
          removeCharacter,
          removeCharacterFromCorporations,
          getCorporation: () => corporation,
        },
      },
      applicationSettings: { userCloudAccounts: cloudAccounts },
    }),
  );
});

vi.mock(
  "../../Functions/Endpoints/Private/cloudStoredEsiRefreshTokens.js",
  () => ({
    deleteCloudStoredEsiRefreshTokens: (...args) =>
      deleteCloudStoredEsiRefreshTokens(...args),
  }),
);

vi.mock("../../Functions/Auth/buildAccountData.js", () => ({
  updateLocalRefreshTokens: (...args) => updateLocalRefreshTokens(...args),
}));

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: vi.fn(),
}));

vi.mock("../../Functions/Auth/refreshAccountSessionGrants.js", () => ({
  default: vi.fn(async () => {}),
}));

function aCharacter(overrides = {}) {
  return {
    CharacterID: 2114794365,
    CharacterName: "Oswold Saraki",
    CharacterHash: "hash-1",
    corporation_id: 98000001,
    ...overrides,
  };
}

function renderEntry(character = aCharacter()) {
  return render(
    <QueryClientProvider client={testQueryClient()}>
      <AccountEntry character={character} />
    </QueryClientProvider>,
  );
}

describe("a linked character", () => {
  beforeEach(() => {
    corporation = {
      corporation_id: 98000001,
      corporationName: "Hard Knocks Inc.",
    };
    cloudAccounts = false;
    removeCharacter.mockClear();
    removeCharacterFromCorporations.mockClear();
    deleteCloudStoredEsiRefreshTokens.mockClear();
    updateLocalRefreshTokens.mockClear();
  });

  it("is named, with the corporation it belongs to", () => {
    renderEntry();

    expect(screen.getByText("Oswold Saraki")).toBeInTheDocument();
    expect(screen.getByText("Hard Knocks Inc.")).toBeInTheDocument();
  });

  it("shows the character's own portrait", () => {
    renderEntry();

    const portrait = screen.getByAltText("Oswold Saraki portrait");
    expect(portrait).toHaveAttribute(
      "src",
      expect.stringContaining("2114794365"),
    );
  });

  it("says so when the corporation is not known", () => {
    corporation = null;
    renderEntry();

    expect(screen.getByText("No corporation")).toBeInTheDocument();
  });

  it("removes the character from the account", async () => {
    const user = userEvent.setup();
    renderEntry();

    await user.click(
      screen.getByRole("button", { name: /remove oswold saraki/i }),
    );

    await waitFor(() => {
      expect(removeCharacter).toHaveBeenCalled();
    });
    // The corporation list is keyed by character, so a removed character has to
    // leave it too or the account keeps a corporation nothing reaches.
    expect(removeCharacterFromCorporations).toHaveBeenCalledWith("hash-1");
  });

  it("clears the stored token from the browser when kept locally", async () => {
    const user = userEvent.setup();
    renderEntry();

    await user.click(
      screen.getByRole("button", { name: /remove oswold saraki/i }),
    );

    await waitFor(() => {
      expect(updateLocalRefreshTokens).toHaveBeenCalled();
    });
    expect(deleteCloudStoredEsiRefreshTokens).not.toHaveBeenCalled();
  });

  it("clears the stored token from the server when kept in the cloud", async () => {
    const user = userEvent.setup();
    cloudAccounts = true;
    renderEntry();

    await user.click(
      screen.getByRole("button", { name: /remove oswold saraki/i }),
    );

    await waitFor(() => {
      expect(deleteCloudStoredEsiRefreshTokens).toHaveBeenCalledWith([
        "hash-1",
      ]);
    });
    expect(updateLocalRefreshTokens).not.toHaveBeenCalled();
  });
});
