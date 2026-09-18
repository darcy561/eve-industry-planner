import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TokenStorageChoice } from "./TokenStorageChoice";

const setCloudAccountsEnabled = vi.fn();
const upsertCloudStoredEsiRefreshTokens = vi.fn(async () => true);
const updateLocalRefreshTokens = vi.fn();

let cloudAccounts = false;
let characters = [];

vi.mock("../../Zustand/usersStore", async () => {
  const { usersStoreMock, usersStoreState } =
    await import("../../tests/usersStoreHarness.js");
  return usersStoreMock(() =>
    usersStoreState({
      account: {
        characters,
        actions: { getMainCharacterHash: () => "main-hash" },
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
  }),
);

vi.mock("../../Functions/Auth/buildAccountData", () => ({
  getLocalAdditionalAccountsStorageKey: () => "main-hash AdditionalAccounts",
  updateLocalRefreshTokens: (...args) => updateLocalRefreshTokens(...args),
}));

vi.mock("../../Functions/Debounce/userDocumentsPersistSchedule.js", () => ({
  scheduleDebouncedUserAccountDocumentSave: vi.fn(),
}));

describe("where linked character tokens are kept", () => {
  beforeEach(() => {
    cloudAccounts = false;
    characters = [
      { CharacterHash: "main-hash", isMainCharacter: true },
      { CharacterHash: "hash-1", esiRefreshToken: "token-1" },
    ];
    setCloudAccountsEnabled.mockClear();
    upsertCloudStoredEsiRefreshTokens.mockClear();
    updateLocalRefreshTokens.mockClear();
    window.localStorage.clear();
  });

  it("says which of the two a reader is on", () => {
    render(<TokenStorageChoice />);

    expect(
      screen.getByRole("button", { name: "This browser" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Cloud" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  // The other option's meaning is one click away; what a reader needs now is what their own choice
  // costs them.
  it("says what the choice they are on means", () => {
    render(<TokenStorageChoice />);

    expect(screen.getByText(/kept in this browser/i)).toBeInTheDocument();
  });

  it("moves the stored tokens to the cloud when asked", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "main-hash AdditionalAccounts",
      JSON.stringify([{ CharacterHash: "hash-1", rToken: "token-1" }]),
    );
    render(<TokenStorageChoice />);

    await user.click(screen.getByRole("button", { name: "Cloud" }));

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

  // Nothing in local storage to move, but the roster is holding the secrets in memory.
  it("sends what the roster holds when the browser has nothing stored", async () => {
    const user = userEvent.setup();
    render(<TokenStorageChoice />);

    await user.click(screen.getByRole("button", { name: "Cloud" }));

    await waitFor(() => {
      expect(upsertCloudStoredEsiRefreshTokens).toHaveBeenCalledWith([
        { CharacterHash: "hash-1", rToken: "token-1" },
      ]);
    });
  });

  it("writes the tokens back to the browser when leaving the cloud", async () => {
    const user = userEvent.setup();
    cloudAccounts = true;
    render(<TokenStorageChoice />);

    await user.click(screen.getByRole("button", { name: "This browser" }));

    await waitFor(() => {
      expect(setCloudAccountsEnabled).toHaveBeenCalledWith(false);
    });
    expect(updateLocalRefreshTokens).toHaveBeenCalled();
  });

  it("does nothing when the mode chosen is the one already set", async () => {
    const user = userEvent.setup();
    render(<TokenStorageChoice />);

    await user.click(screen.getByRole("button", { name: "This browser" }));

    expect(setCloudAccountsEnabled).not.toHaveBeenCalled();
    expect(upsertCloudStoredEsiRefreshTokens).not.toHaveBeenCalled();
  });
});
